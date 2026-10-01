import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { processDocumentPipeline } from '@/lib/document-processing/pipeline';

export const maxDuration = 60; // Allow up to 60s for this route (Vercel etc.)

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read bytes first so we can do magic-byte check
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check file size (25 MB hard cap)
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. Maximum allowed size is 25 MB.` },
        { status: 400 }
      );
    }

    // Validate magic bytes — MUST match before storing anything
    let detectedMime: string | null = null;
    if (buffer.length >= 4) {
      const hex = buffer.subarray(0, 4).toString('hex').toUpperCase();
      if (hex === '25504446') {
        detectedMime = 'application/pdf'; // %PDF
      } else if (hex === '504B0304') {
        // ZIP-based — could be DOCX, XLSX, PPTX, etc.
        // Check for word/document.xml inside the zip to confirm DOCX
        const zipContents = buffer.toString('binary');
        if (zipContents.includes('word/document.xml')) {
          detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        // else: it's some other ZIP-based format, rejected below
      }
    }

    if (!detectedMime) {
      const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '(unknown)';
      return NextResponse.json(
        { error: `Only PDF and DOCX files are supported. You uploaded a ${ext}` },
        { status: 400 }
      );
    }

    // Insert document row with status=uploading
    const [doc] = await db.insert(documents).values({
      name: file.name,
      mime: detectedMime,
      size: buffer.length,
      status: 'uploading',
      file_bytes: buffer,
    }).returning();

    // Fire-and-forget: run processing pipeline (updates status as it goes)
    const capturedDocId = doc.id;
    void processDocumentPipeline(capturedDocId, buffer, detectedMime).catch(async (err) => {
      console.error(`Unhandled pipeline error doc=${capturedDocId}:`, err);
      try {
        const { eq } = await import('drizzle-orm');
        await db.update(documents)
          .set({ status: 'failed', error_code: 'UNKNOWN_ERROR', status_message: String(err?.message || err) })
          .where(eq(documents.id, capturedDocId));
      } catch (_) {}
    });

    return NextResponse.json({ docId: doc.id, name: doc.name, status: doc.status });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
