[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$QueueName,
    [switch]$Send
)

$ErrorActionPreference = 'Stop'
Import-Module PrintManagement -ErrorAction Stop
$printer = Get-Printer -Name $QueueName -ErrorAction SilentlyContinue
if (-not $printer) { throw "Windows printer queue '$QueueName' was not found." }
if ($printer.PortName -notmatch '^USB\d+$') {
    throw "Queue '$QueueName' is on '$($printer.PortName)', not a local USB port. Use the network profile for LAN printing."
}

Write-Host ("Queue: {0} | Driver: {1} | Port: {2} | Status: {3}" -f $printer.Name, $printer.DriverName, $printer.PortName, $printer.PrinterStatus)
if (-not $Send) {
    Write-Host 'No print job was sent. Add -Send to print a short, non-sale RAW test slip.'
    return
}

if (-not ('ServOS.RawUsbPrinter' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace ServOS {
    public static class RawUsbPrinter {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct DOC_INFO_1 {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
        }

        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);

        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern uint StartDocPrinter(IntPtr handle, int level, ref DOC_INFO_1 info);

        [DllImport("winspool.drv", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool StartPagePrinter(IntPtr handle);

        [DllImport("winspool.drv", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

        [DllImport("winspool.drv", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EndPagePrinter(IntPtr handle);

        [DllImport("winspool.drv", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EndDocPrinter(IntPtr handle);

        [DllImport("winspool.drv", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ClosePrinter(IntPtr handle);

        public static string Send(string queueName, byte[] data) {
            IntPtr handle;
            if (!OpenPrinter(queueName, out handle, IntPtr.Zero))
                return "Could not open printer queue (Win32 " + Marshal.GetLastWin32Error() + ").";
            bool documentStarted = false;
            try {
                var info = new DOC_INFO_1 {
                    pDocName = "ServOS XP-80T USB test",
                    pOutputFile = null,
                    pDatatype = "RAW"
                };
                if (StartDocPrinter(handle, 1, ref info) == 0)
                    return "Windows spooler rejected the RAW job (Win32 " + Marshal.GetLastWin32Error() + ").";
                documentStarted = true;
                if (!StartPagePrinter(handle))
                    return "Windows spooler could not start the test page (Win32 " + Marshal.GetLastWin32Error() + ").";
                int written;
                if (!WritePrinter(handle, data, data.Length, out written) || written != data.Length)
                    return "Windows spooler wrote " + written + "/" + data.Length + " bytes (Win32 " + Marshal.GetLastWin32Error() + ").";
                if (!EndPagePrinter(handle))
                    return "Windows spooler could not finish the page (Win32 " + Marshal.GetLastWin32Error() + ").";
                if (!EndDocPrinter(handle))
                    return "Windows spooler could not finish the RAW job (Win32 " + Marshal.GetLastWin32Error() + ").";
                documentStarted = false;
                return null;
            } finally {
                if (documentStarted) EndDocPrinter(handle);
                ClosePrinter(handle);
            }
        }
    }
}
'@
}

$testText = @(
    'SERVOS XP-80T USB TEST'
    ('Queue: ' + $printer.Name)
    ('Time:  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    'NO SALE - NO CASH DRAWER SIGNAL'
    ''
    ''
) -join [Environment]::NewLine
$payload = [System.Collections.Generic.List[byte]]::new()
$payload.Add([byte]0x1B)
$payload.Add([byte]0x40)
$payload.AddRange([System.Text.Encoding]::ASCII.GetBytes($testText))
$payloadBytes = $payload.ToArray()
$errorMessage = [ServOS.RawUsbPrinter]::Send($printer.Name, $payloadBytes)
if ($errorMessage) { throw $errorMessage }
Write-Host 'Windows spooler accepted the short RAW test slip. Check the printer for paper; this API cannot confirm physical output.' -ForegroundColor Green
