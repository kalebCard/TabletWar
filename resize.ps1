Add-Type -AssemblyName System.Drawing
"$img = [System.Drawing.Image]::FromFile('public\assets\textures\gothic_wall.png')
"$bmp = New-Object System.Drawing.Bitmap 256, 256
"$g = [System.Drawing.Graphics]::FromImage($bmp)
"$g.DrawImage($img, 0, 0, 256, 256)
"$bmp.Save('public\assets\textures\gothic_wall_small.png', [System.Drawing.Imaging.ImageFormat]::Png)
