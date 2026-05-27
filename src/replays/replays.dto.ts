import {
  IsString, IsInt, IsArray, IsOptional, IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UserDto {
  @IsOptional() @IsString() user_id?: string;
  @IsOptional() @IsString() user_name?: string;
}

class CompanyDto {
  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsString() company_name?: string;
}

class ErrorDto {
  @IsString() type: string;
  @IsString() name: string;
  @IsString() message: string;
  @IsInt() status_code: number;
  @IsString() request_url: string;
  @IsOptional() @IsString() stack?: string;
  @IsOptional() @IsArray() stack_trace?: unknown[];
}

class BrowserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() user_agent?: string;
}

class OsDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() version?: string;
}

class ScreenDto {
  @IsOptional() @IsInt() width?: number;
  @IsOptional() @IsInt() height?: number;
}

class ViewportDto {
  @IsOptional() @IsInt() width?: number;
  @IsOptional() @IsInt() height?: number;
}

class DeviceDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @ValidateNested() @Type(() => ScreenDto) screen?: ScreenDto;
  @IsOptional() @ValidateNested() @Type(() => ViewportDto) viewport?: ViewportDto;
}

class ClientDto {
  @IsOptional() @ValidateNested() @Type(() => BrowserDto) browser?: BrowserDto;
  @IsOptional() @ValidateNested() @Type(() => OsDto) os?: OsDto;
  @IsOptional() @ValidateNested() @Type(() => DeviceDto) device?: DeviceDto;
}

class ReplayPayloadDto {
  @IsArray() events: unknown[];
  @IsInt() duration_ms: number;
  @IsInt() started_at: number;
  @IsInt() ended_at: number;
}

export class CreateReplayDto {
  @IsString() tenant_id: string;
  @IsString() public_key: string;
  @IsString() session_id: string;
  @IsString() release: string;
  @IsString() environment: string;
  @IsString() page_url: string;

  @IsOptional() @ValidateNested() @Type(() => UserDto) user?: UserDto;
  @IsOptional() @ValidateNested() @Type(() => CompanyDto) company?: CompanyDto;

  @ValidateNested() @Type(() => ErrorDto) error: ErrorDto;
  @IsOptional() @ValidateNested() @Type(() => ClientDto) client?: ClientDto;

  @IsOptional() @IsArray() http_requests?: unknown[];

  @ValidateNested() @Type(() => ReplayPayloadDto) replay: ReplayPayloadDto;

  @IsDateString() occurred_at: string;
}
