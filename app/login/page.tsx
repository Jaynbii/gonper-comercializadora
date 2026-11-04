import { ArrowRight } from 'lucide-react'
import { login } from './actions'

function ScythMark() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-[12px] bg-scyth-acid text-scyth-graphite">
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M7 23.5 17.5 7h7L14 25h-7Z" fill="currentColor" />
        <path d="M17.5 7 25 7 20.8 13.7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      </svg>
    </span>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(60rem 40rem at 50% -12%, #ffffff 0%, transparent 65%), linear-gradient(#171d1908 1px, transparent 1px)',
          backgroundSize: 'auto, 100% 3.25rem',
        }}
      />

      <div className="relative w-full max-w-100">
        <div className="flex flex-col items-center text-center">
          <ScythMark />
          <h1 className="mt-4 text-[34px] font-bold leading-none tracking-[0.16em] text-gonper-text">
            SCYTH
          </h1>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gonper-muted">
            Work smarter. Move faster.
          </p>
          <p className="mt-1 text-[11px] font-medium tracking-[0.08em] text-gonper-muted">
            Business Operations Platform
          </p>
        </div>

        <div className="card mt-8 p-6 sm:p-7">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em]">
            Ingresa a tu cuenta
          </h2>
          <p className="mt-1 text-[12.5px] text-gonper-muted">
            Órdenes, inventario, compras y operaciones.
          </p>

          <form action={login} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                className="field"
                name="email"
                type="email"
                placeholder="email@provider.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className="field"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary mt-2 w-full">
              Ingresar al sistema
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </button>

            {message && (
              <p
                role="alert"
                className="rounded-[6px] border border-gonper-danger-border bg-gonper-danger-bg px-3 py-2 text-center text-[12.5px] leading-relaxed text-gonper-danger"
              >
                {message}
              </p>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-gonper-muted">
          SCYTH · Business Operations Platform
        </p>
      </div>
    </div>
  )
}
