import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const target = `${API}/${path.join('/')}${request.nextUrl.search}`
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    })
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch {
    return NextResponse.json(
      { detail: 'Backend is not running. Start FastAPI on port 8000.' },
      { status: 503 }
    )
  }
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
