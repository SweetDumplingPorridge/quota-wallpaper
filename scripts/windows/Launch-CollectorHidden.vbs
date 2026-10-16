Option Explicit
Dim shell, files, launcher, command, outputFile, exitCode
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
launcher = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "Start-Collector.ps1")
command = Quote(shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(launcher)
If WScript.Arguments.Count > 1 Then WScript.Quit 2
If WScript.Arguments.Count = 1 Then
    outputFile = WScript.Arguments.Item(0)
    command = command & " -OutputFile " & Quote(outputFile)
End If
' A GUI-subsystem host starts the shell hidden from the outset, without a console flash.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

Function Quote(value)
    If InStr(value, Chr(34)) > 0 Or InStr(value, vbCr) > 0 Or InStr(value, vbLf) > 0 Then WScript.Quit 2
    Quote = Chr(34) & value & Chr(34)
End Function
