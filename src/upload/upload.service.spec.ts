import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';

jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ format: 'png' }),
  }));
});

describe('UploadService magic-byte validation', () => {
  it('rejects buffers that are not valid images', async () => {
    const sharp = jest.requireMock('sharp') as jest.Mock;
    sharp.mockImplementationOnce(() => ({
      metadata: jest.fn().mockRejectedValue(new Error('Input buffer is empty')),
    }));

    const upload = jest.fn();
    const supabaseService = {
      getClient: () => ({
        storage: {
          from: () => ({
            upload,
            getPublicUrl: () => ({ data: { publicUrl: 'https://x' } }),
          }),
        },
      }),
    };

    const service = new UploadService(supabaseService as never);

    await expect(
      service.uploadImage('tenant-1', {
        buffer: Buffer.from('not-an-image'),
        mimetype: 'image/jpeg',
        size: 12,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });
});
