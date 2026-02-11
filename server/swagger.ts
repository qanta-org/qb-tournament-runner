import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Quiz Bowl Buzzer API',
      version: '1.0.0',
      description: `
## Overview
REST API for the Quiz Bowl Buzzer web application.

### Authentication
Currently no authentication required.

### WebSocket Events
For real-time game events, connect to the Socket.io server at \`ws://localhost:3001\`.
See the README for WebSocket event documentation.
      `,
      contact: {
        name: 'Quiz Bowl Buzzer',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Server health check' },
      { name: 'Datasets', description: 'Dataset listing and validation' },
      { name: 'Rosters', description: 'Player roster management' },
      { name: 'Config', description: 'Game configuration' },
      { name: 'Files', description: 'File upload management' },
    ],
  },
  apis: ['./server/routes/*.ts', './server/index.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
