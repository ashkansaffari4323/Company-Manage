$files = Get-ChildItem ".\api" -Recurse -File -Filter "*.js"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw

    $content = $content.Replace("require('../_lib')", "require('../../lib/_lib')")
    $content = $content.Replace('require("../_lib")', 'require("../../lib/_lib")')

    [System.IO.File]::WriteAllText($file.FullName, $content)
}

Write-Host "Updated API imports to ../../lib/_lib"