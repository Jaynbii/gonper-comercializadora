# Requisa Software

Sistema interno de Gonper Comercializadora (Mazatlán) para operar requisiciones de dependencias y mercados municipales: lectura de facturas PDF y fotos, cotejo contra inventario, surtido y compra del faltante al proveedor más barato con precio registrado.

El nombre visible en la web es **Requisa Software**; el repositorio y la URL de producción conservan el nombre anterior (`gonper-comercializadora`).

- **Producción:** https://gonper-comercializadora.vercel.app (Vercel despliega desde `main`)
- **Documentación completa:** `DOCUMENTACION_GONPER.md`
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase (Auth, Postgres, Storage)

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # llena las variables de Supabase (y GEMINI_API_KEY si quieres lectura de fotos con IA)
npm run dev
```

## Verificación

```bash
npm test           # tests de utils
npx tsc --noEmit   # tipos
npm run lint       # eslint
npm run build      # build de producción
```

## Flujo de trabajo

Se trabaja directo sobre `main` (sin PRs). Cada push a `main` despliega en Vercel. Las migraciones de base de datos se revisan como SQL y se corren en el SQL Editor de Supabase; nunca se edita la base de producción directamente desde el código.
