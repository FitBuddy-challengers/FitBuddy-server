// src/swaagger/swagger.js
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const swaggerJSDoc = require('swagger-jsdoc');

module.exports = function mountSwagger(app) {
  // 1) 우선순위: openapi.yaml 파일이 있으면 그걸 사용
  const yamlPath = path.join(__dirname, 'openapi.yaml');
  let spec = null;

  if (fs.existsSync(yamlPath)) {
    const file = fs.readFileSync(yamlPath, 'utf8');
    spec = YAML.parse(file);
    console.log('🧾 Loaded OpenAPI spec from openapi.yaml');
  } else {
    // 2) 파일이 없으면 swagger-jsdoc로 최소 스펙을 생성(필요 시 확장)
    console.warn('⚠️ openapi.yaml이 없어 swagger-jsdoc 기본 스펙을 사용합니다.');
    spec = swaggerJSDoc({
      definition: {
        openapi: '3.1.0',
        info: {
          title: 'FitBuddy API',
          version: '1.0.0',
          description:
            'Auth, Challenge, Exercise, Records, Store 엔드포인트 문서. openapi.yaml이 있으면 자동으로 대체됩니다.',
        },
        servers: [
          { url: 'https://api.example.com', description: 'Production' },
          { url: 'http://localhost:3000', description: 'Local' },
        ],
      },
      // 필요한 경우 JSDoc 주석으로 확장하고 싶다면 여기에 라우트 파일 경로 추가
      // e.g. ['./auth.js', './challenge.js', './exercise.js']
      apis: [],
    });
  }

  // JSON/YAML spec도 같이 서빙
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').send(YAML.stringify(spec)));

  // Swagger UI
  const uiOptions = {
    customSiteTitle: 'FitBuddy API Docs',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  };

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, uiOptions));
  console.log('✅ Swagger UI mounted at /docs');
};