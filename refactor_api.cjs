const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('g:/MotionFrame/src');
let changed = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace fetch('/api/...)
  content = content.replace(/fetch\(['"]\/api\//g, 'fetch(`${API_BASE_URL}/api/');
  
  // Replace fetch(`/api/...)
  content = content.replace(/fetch\(`\/api\//g, 'fetch(`${API_BASE_URL}/api/');

  // Replace fetch('/upload...)
  content = content.replace(/fetch\(['"]\/upload/g, 'fetch(`${API_BASE_URL}/upload');
  content = content.replace(/fetch\(`\/upload/g, 'fetch(`${API_BASE_URL}/upload');
  
  // Specifically for images in Resources.jsx: src={`/api/
  content = content.replace(/src=\{`\/api\//g, 'src={`${API_BASE_URL}/api/');

  if (content !== original) {
    // Add import statement at the top
    const relativePathToConfig = path.relative(path.dirname(file), 'g:/MotionFrame/src/config').replace(/\\/g, '/');
    let importPath = relativePathToConfig.startsWith('.') ? relativePathToConfig : './' + relativePathToConfig;
    
    // Check if API_BASE_URL is already imported
    if (!content.includes('API_BASE_URL')) {
        // If they don't have it, but they should if we replaced it
    }
    
    if (content.includes('API_BASE_URL') && !content.includes('from \'' + importPath)) {
        const importStmt = `import { API_BASE_URL } from '${importPath}';\n`;
        // Insert after first imports or at top
        const firstImportMatch = content.match(/^import .*;?$/m);
        if (firstImportMatch) {
            content = content.substring(0, firstImportMatch.index) + importStmt + content.substring(firstImportMatch.index);
        } else {
            content = importStmt + content;
        }
    }
    
    fs.writeFileSync(file, content, 'utf8');
    changed++;
  }
});
console.log(`Updated ${changed} files for API_BASE_URL.`);
