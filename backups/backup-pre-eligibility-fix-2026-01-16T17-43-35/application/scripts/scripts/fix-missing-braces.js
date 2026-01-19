/**
 * Fix missing closing braces in API route files
 * Pattern: if/else blocks with return statements missing closing braces
 */

const fs = require('fs');

function fixMissingBraces(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fixedLines = [];
  
  let pendingCloseBrace = false;
  let lastReturnIndent = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.match(/^(\s*)/)[1].length;
    
    // Check if we have a pending close brace and this line is at the same or lower indentation
    if (pendingCloseBrace && trimmed && !trimmed.startsWith('//')) {
      // Check if this line should have a } before it
      if (indent <= lastReturnIndent && 
          !trimmed.startsWith('}') && 
          !trimmed.startsWith(')') &&
          !trimmed === '') {
        // Add closing brace at the right indentation
        fixedLines.push(' '.repeat(lastReturnIndent) + '}');
        pendingCloseBrace = false;
      }
    }
    
    fixedLines.push(line);
    
    // Detect return statements that might need closing braces
    if (trimmed.startsWith('return NextResponse.json(') && 
        trimmed.endsWith(')') && 
        !lines[i+1]?.trim().startsWith('}')) {
      lastReturnIndent = indent - 2;  // The if block is usually 2 spaces less
      pendingCloseBrace = true;
    }
  }
  
  const fixedContent = fixedLines.join('\n');
  if (fixedContent !== content) {
    fs.writeFileSync(filePath, fixedContent);
    return true;
  }
  return false;
}

// Files to fix
const files = [
  'app/api/shipments/[shipmentId]/pickup/reschedule/route.ts',
  'app/api/shipments/[shipmentId]/pickup/route.ts',
  'app/api/shipments/[shipmentId]/pickup/schedule/route.ts',
];

console.log('Attempting to fix missing braces...');
files.forEach(f => {
  try {
    if (fixMissingBraces(f)) {
      console.log('Fixed:', f);
    }
  } catch (e) {
    console.log('Error:', f, e.message);
  }
});
