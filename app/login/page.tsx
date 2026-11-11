import { ArrowRight } from 'lucide-react'
import { login } from './actions'

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
            'radial-gradient(60rem 40rem at 50% -12%, #ffffff 0%, transparent 65%), linear-gradient(#354f5208 1px, transparent 1px)',
          backgroundSize: 'auto, 100% 3.25rem',
        }}
      />

      <div className="relative w-full max-w-100">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[10px] bg-gonper-primary font-serif text-[26px] leading-none text-gonper-on-primary">
            G
          </span>
          <h1 className="mt-4 font-serif text-[42px] leading-none tracking-[-0.02em]">
            Gonper
          </h1>
          <p className="eyebrow mt-2">Comercializadora</p>
        </div>

        <div className="card mt-8 p-6 sm:p-7">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em]">
            Ingresa a tu cuenta
          </h2>
          <p className="mt-1 text-[12.5px] text-gonper-muted">
            Inventario, requisiciones y compras.
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

        <p className="mt-6 text-center text-[11px] tracking-[0.02em] text-gonper-muted">
          Sistema interno · Uso exclusivo de Gonper
        </p>
      </div>
    </div>
  )
}
