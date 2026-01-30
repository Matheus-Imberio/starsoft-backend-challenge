import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AddSeatsDto } from './dto/add-seats.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar sessão de cinema' })
  create(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.create(createSessionDto);
  }

  @Post(':id/seats')
  @ApiOperation({ summary: 'Adicionar assentos à sessão (mín. 16)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  addSeats(@Param('id') id: string, @Body() dto: AddSeatsDto) {
    return this.sessionsService.addSeats(id, dto.seatNumbers);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Disponibilidade de assentos da sessão' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getAvailability(@Param('id') id: string) {
    return this.sessionsService.getAvailability(id);
  }
}
