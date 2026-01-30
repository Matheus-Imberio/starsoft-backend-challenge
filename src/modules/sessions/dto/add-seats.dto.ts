import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class AddSeatsDto {
  @ApiProperty({ example: ['A1', 'A2', 'A3', 'A4'], type: [String], minItems: 1 })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  seatNumbers: string[];
}
