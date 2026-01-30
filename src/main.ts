import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppLoggerService } from './common/logger/logger.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLoggerService));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cinema API')
    .setDescription('API de venda de ingressos para cinema')
    .setVersion('1.0')
    .addTag('users')
    .addTag('sessions')
    .addTag('reservations')
    .addTag('payments')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(AppLoggerService).log(`Application listening on port ${port}`, 'Bootstrap');
  app.get(AppLoggerService).log(`Swagger: http://localhost:${port}/api-docs`, 'Bootstrap');
}
bootstrap();
