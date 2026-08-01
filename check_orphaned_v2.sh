#!/bin/bash
# Extract effect names from defaults
grep "^  [A-Z].*Effect:" packages/effects/src/renderEffectDefaults.ts | sed 's/:.*//' | sed 's/^ *//' | while read effect; do
  typefile="packages/types/src/${effect}.ts"
  if [ -f "$typefile" ]; then
    # Extract all field names from defaults entry - more carefully
    defaults_line=$(grep "^  ${effect}:" packages/effects/src/renderEffectDefaults.ts)
    # Get field names: look for word characters followed by colon inside braces
    defaults_fields=$(echo "$defaults_line" | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*:' | sed 's/:$//' | sort | uniq)
    
    # Check each field against type file
    for field in $defaults_fields; do
      # Simple check: does the type file have this field?
      if ! grep -q "^\s*${field}?" "$typefile"; then
        echo "ORPHANED: $effect.$field"
      fi
    done
  fi
done
