import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Reservar assento(s) — válido 30s' })
  reserve(@Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.reserve(createReservationDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Reservas do usuário' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  findByUserId(@Param('userId') userId: string) {
    return this.reservationsService.findByUserId(userId);
  }
}
