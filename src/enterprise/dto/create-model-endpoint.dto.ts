import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateModelEndpointDto {
  @ApiProperty({ description: 'Human-readable name for this endpoint' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: 'Base URL of the OpenAI-compatible API (e.g. http://localhost:11434/v1)' })
  @IsUrl({ require_tld: false })
  baseUrl: string;

  @ApiProperty({ description: 'API key for the endpoint (stored encrypted with AES-256-GCM)' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  apiKey: string;

  @ApiProperty({ description: 'Model ID to use (e.g. llama3, mistral, qwen2.5)' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  modelId: string;

  @ApiProperty({ description: 'Provider label (e.g. ollama, vllm, custom)' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  provider: string;
}
