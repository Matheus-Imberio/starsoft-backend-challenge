import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsInt, Min } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ example: 'Filme X - 19:00' })
  @IsString()
  @IsNotEmpty()
  movieTitle: string;

  @ApiProperty({ example: 'Sala 1' })
  @IsString()
  @IsNotEmpty()
  roomName: string;

  @ApiProperty({ example: '2026-02-01T19:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: 2500, description: 'Preço em centavos' })
  @IsInt()
  @Min(0)
  priceCents: number;
}
