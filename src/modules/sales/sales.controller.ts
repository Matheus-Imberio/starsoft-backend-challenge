import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@ApiTags('payments')
@Controller('payments')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('confirm')
  @ApiOperation({ summary: 'Confirmar pagamento e converter reserva em venda' })
  confirm(@Body() confirmPaymentDto: ConfirmPaymentDto) {
    return this.salesService.confirmPayment(confirmPaymentDto);
  }

  @Get('user/:userId/history')
  @ApiOperation({ summary: 'Histórico de compras do usuário' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  getHistory(@Param('userId') userId: string) {
    return this.salesService.findByUserId(userId);
  }
}
