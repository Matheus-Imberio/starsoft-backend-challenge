import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(dto);
    try {
      return await this.userRepository.save(user);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err?.code === '23505') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }
}
