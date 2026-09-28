import { createSwaggerSpec } from 'next-swagger-doc';

export const getApiDocs = async () => {
    const spec = createSwaggerSpec({
        apiFolder: 'app/api', // define api folder
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Warehouse Express API',
                version: '1.0',
                description: 'API Documentation for Warehouse Express Application',
            },
            components: {
                securitySchemes: {
                    BearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [
                {
                    BearerAuth: [],
                },
            ],
        },
    });
    return spec;
};
