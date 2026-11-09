import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CvModule } from './cv/cv.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CvModule],
})
export class AppModule {}
