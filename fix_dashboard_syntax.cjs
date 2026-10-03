const fs = require('fs');
let code = fs.readFileSync('src/features/dashboard/Dashboard.tsx', 'utf8');

code = code.replace(
  `          </div>
        </div>

      </div>`,
  `          </div>
        </div>
        )}
      </div>`
);

fs.writeFileSync('src/features/dashboard/Dashboard.tsx', code);
