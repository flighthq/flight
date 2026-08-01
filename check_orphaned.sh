#!/bin/bash
# Extract effect names from defaults
grep "^  [A-Z].*Effect:" packages/effects/src/renderEffectDefaults.ts | sed 's/:.*$//' | sed 's/^  //' | while read effect; do
  typefile="packages/types/src/${effect}.ts"
  if [ -f "$typefile" ]; then
    # Extract all field names from defaults entry
    defaults_line=$(grep "^  ${effect}:" packages/effects/src/renderEffectDefaults.ts)
    defaults_fields=$(echo "$defaults_line" | grep -o '[a-z][a-zA-Z]*:' | sed 's/:$//' | sort | uniq)
    
    # Check each field
    for field in $defaults_fields; do
      if ! grep -q "^\s*${field}?" "$typefile"; then
        echo "ORPHANED: $effect.$field in defaults but NOT in type"
      fi
    done
  fi
done
