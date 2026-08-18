const { scan } = require("sonarqube-scanner");

scan(
  {
    serverUrl: "http://localhost:9000",
    token: process.env.SONAR_TOKEN,
    options: {
      "sonar.projectKey": "multi-tenant-ecommerce",
      "sonar.projectName": "Multi-Tenant E-Commerce Platform",
      "sonar.sources": "src",
      "sonar.exclusions":
        "**/node_modules/**,**/dist/**,**/build/**,**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx",
      "sonar.sourceEncoding": "UTF-8",
    },
  },
  () => process.exit()
);