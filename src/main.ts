import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3043);
  await app.listen(port);
  Logger.log(`cv-analyzer écoute sur http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
