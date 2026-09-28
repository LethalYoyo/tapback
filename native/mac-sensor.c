// Experimental SPU adapter. Report layout documented by olvvier/macimu (MIT).
// No privilege escalation, global hooks, or persistent system modifications.
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/hid/IOHIDDevice.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>

static volatile sig_atomic_t running = 1;
static int received = 0;
static double last_emit = 0;
static double last_report = 0;
static void stop(int signo) { (void)signo; running = 0; }
static int number(io_service_t svc, CFStringRef key) {
    CFTypeRef p = IORegistryEntryCreateCFProperty(svc, key, kCFAllocatorDefault, 0);
    int n = 0;
    if (p) { if (CFGetTypeID(p) == CFNumberGetTypeID()) CFNumberGetValue(p, kCFNumberIntType, &n); CFRelease(p); }
    return n;
}
static void report(void *ctx, IOReturn result, void *sender, IOHIDReportType type,
                   uint32_t reportID, uint8_t *bytes, CFIndex length) {
    (void)ctx; (void)sender; (void)type; (void)reportID;
    if (result != kIOReturnSuccess || length != 22) return;
    double now = CFAbsoluteTimeGetCurrent();
    last_report = now;
    if (!received++) puts("{\"type\":\"ready\",\"message\":\"MacBook motion sensor connected\"}");
    if (now - last_emit < 0.008) return;
    last_emit = now;
    int32_t x, y, z;
    memcpy(&x, bytes + 6, 4); memcpy(&y, bytes + 10, 4); memcpy(&z, bytes + 14, 4);
    printf("{\"type\":\"sample\",\"x\":%.6f,\"y\":%.6f,\"z\":%.6f}\n", x / 65536.0, y / 65536.0, z / 65536.0);
}
int main(void) {
    setvbuf(stdout, NULL, _IOLBF, 0);
    signal(SIGINT, stop); signal(SIGTERM, stop);
    io_iterator_t iterator = 0;
    if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleSPUHIDDevice"), &iterator) != KERN_SUCCESS) return 1;
    IOHIDDeviceRef device = NULL;
    io_service_t service;
    int found = 0;
    while ((service = IOIteratorNext(iterator))) {
        if (number(service, CFSTR("PrimaryUsagePage")) == 0xFF00 && number(service, CFSTR("PrimaryUsage")) == 3) {
            found = 1;
            IOHIDDeviceRef candidate = IOHIDDeviceCreate(kCFAllocatorDefault, service);
            if (candidate && IOHIDDeviceOpen(candidate, kIOHIDOptionsTypeNone) == kIOReturnSuccess) device = candidate;
            else if (candidate) CFRelease(candidate);
        }
        IOObjectRelease(service);
        if (device) break;
    }
    IOObjectRelease(iterator);
    if (!device) {
        puts(found ? "{\"type\":\"unavailable\",\"message\":\"macOS denied sensor access. Use microphone mode; this build does not install a privileged helper.\"}" : "{\"type\":\"unavailable\",\"message\":\"No compatible Apple SPU accelerometer found. Try microphone mode.\"}");
        return 2;
    }
    // Request reporting through the opened device. Access failures are not bypassed.
    int one = 1, interval = 10000;
    CFNumberRef state = CFNumberCreate(NULL, kCFNumberIntType, &one);
    CFNumberRef rate = CFNumberCreate(NULL, kCFNumberIntType, &interval);
    IOHIDDeviceSetProperty(device, CFSTR("SensorPropertyReportingState"), state);
    IOHIDDeviceSetProperty(device, CFSTR("SensorPropertyPowerState"), state);
    IOHIDDeviceSetProperty(device, CFSTR("ReportInterval"), rate);
    CFRelease(state); CFRelease(rate);
    uint8_t buffer[4096];
    IOHIDDeviceRegisterInputReportCallback(device, buffer, sizeof(buffer), report, NULL);
    IOHIDDeviceScheduleWithRunLoop(device, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);
    last_report = CFAbsoluteTimeGetCurrent();
    while (running && getppid() != 1) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, false);
        if (CFAbsoluteTimeGetCurrent() - last_report > 3) {
            puts("{\"type\":\"unavailable\",\"message\":\"Sensor is not delivering readings. Microphone mode is available.\"}");
            break;
        }
    }
    IOHIDDeviceUnscheduleFromRunLoop(device, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);
    IOHIDDeviceClose(device, kIOHIDOptionsTypeNone);
    CFRelease(device);
    return 0;
}
