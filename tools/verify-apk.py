import zipfile, hashlib, os, sys
apk, src = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(apk)
files = ['index.html', 'manifest.webmanifest', 'sw.js']
for d, _, fs in os.walk(os.path.join(src, 'assets')):
    for f in fs:
        files.append(os.path.relpath(os.path.join(d, f), src).replace('\\', '/'))
bad = []
for rel in files:
    inzip = 'assets/www/' + rel
    if inzip not in z.namelist():
        bad.append(('MISSING', rel)); continue
    h1 = hashlib.md5(z.read(inzip)).hexdigest()
    h2 = hashlib.md5(open(os.path.join(src, rel), 'rb').read()).hexdigest()
    if h1 != h2: bad.append(('DIFF', rel))
print('比对文件数:', len(files))
print('不一致:', bad if bad else '无 —— APK 内资源与源码完全一致')
sys.exit(1 if bad else 0)
