const fs = require('fs');
const path = require('path');

function patchRollup() {
  const pnpmDir = path.join(__dirname, '..', 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const entries = fs.readdirSync(pnpmDir);
  for (const entry of entries) {
    if (entry.startsWith('rollup@')) {
      const nativePath = path.join(pnpmDir, entry, 'node_modules', 'rollup', 'dist', 'native.js');
      if (fs.existsSync(nativePath)) {
        let content = fs.readFileSync(nativePath, 'utf8');
        if (!content.includes('@rollup/wasm-node')) {
          content = content.replace(
            `const nativeModule = requireWithFriendlyError(`,
            `let nativeModule;\ntry {\n\tnativeModule = requireWithFriendlyError(`
          ).replace(
            `\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`\n);`,
            `\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`\n);\n} catch (err) {\n\ttry {\n\t\tnativeModule = require('@rollup/wasm-node/dist/native.js');\n\t} catch {\n\t\tthrow err;\n\t}\n}`
          );
          fs.writeFileSync(nativePath, content, 'utf8');
          console.log('Patched rollup native.js for WebAssembly fallback in', entry);
        }
      }
    }
  }
}

patchRollup();

