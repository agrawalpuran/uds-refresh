const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all API route files
const routeFiles = glob.sync('app/api/**/route.ts', { cwd: __dirname + '/..' });

let totalFixed = 0;

routeFiles.forEach(filePath => {
  const fullPath = path.join(__dirname, '..', filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  const originalContent = content;

  // Pattern 1: Fix missing closing brace before catch
  // Match: return statement followed by } catch (without closing the if/try)
  // Look for: return NextResponse.json(...) followed by } catch without a closing brace
  
  // Pattern 2: Fix missing closing brace for if statements before catch
  // Match: if (!something) { return ... } catch
  // Should be: if (!something) { return ... } } catch
  
  // Pattern 3: Fix missing closing brace for try blocks
  // Match: return NextResponse.json(...) } catch
  // Should be: return NextResponse.json(...) } } catch (if inside try) or just } catch (if closing try)
  
  // More specific patterns:
  
  // Fix: return NextResponse.json(...)\n  } catch
  // This means missing closing brace for if/try
  content = content.replace(
    /(\s+return NextResponse\.json\([^)]+\))\n(\s+)\} catch/g,
    (match, returnStmt, indent) => {
      modified = true;
      return returnStmt + '\n' + indent + '  }\n' + indent + '} catch';
    }
  );
  
  // Fix: if (!something) {\n    return ...\n  } catch
  // Missing closing brace for if
  content = content.replace(
    /(if\s*\([^)]+\)\s*\{\s*\n(?:\s+[^\n]+\n)*?\s+return\s+NextResponse\.json\([^)]+\))\n(\s+)\} catch/g,
    (match, ifBlock, indent) => {
      modified = true;
      return ifBlock + '\n' + indent + '  }\n' + indent + '} catch';
    }
  );
  
  // Fix: return statement without closing brace before catch
  // Pattern: return ...\n  } catch (where the } is for try, but if is not closed)
  content = content.replace(
    /(\s+)(return\s+NextResponse\.json\([^)]+\))\n(\s+)\} catch/g,
    (match, indent1, returnStmt, indent2) => {
      // Check if this is inside an if statement by looking backwards
      const beforeMatch = originalContent.substring(0, originalContent.indexOf(match));
      const lines = beforeMatch.split('\n');
      let ifCount = 0;
      let braceCount = 0;
      
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.includes('if (')) ifCount++;
        if (line.includes('{')) braceCount++;
        if (line.includes('}')) braceCount--;
        if (line.includes('try {')) break;
        if (ifCount > 0 && braceCount === 0) {
          // We have an unclosed if
          modified = true;
          return indent1 + returnStmt + '\n' + indent1 + '  }\n' + indent2 + '} catch';
        }
      }
      
      return match;
    }
  );

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    totalFixed++;
    console.log(`Fixed: ${filePath}`);
  }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
