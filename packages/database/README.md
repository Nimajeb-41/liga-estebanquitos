# @liga/database

Esquema PostgreSQL de la Liga Estabanquitos, definido con Drizzle ORM.

```
src/schema/     14 tablas, agrupadas por agregado
drizzle/        Migraciones SQL generadas y versionadas
```

```bash
npm run db:up                                    # PostgreSQL en Docker
npm run db:generate --workspace=@liga/database   # esquema -> SQL
npm run db:migrate  --workspace=@liga/database   # aplicar
```

La cadena de conexion llega por `DATABASE_URL`; nunca se escribe en el codigo.

Documentacion: [modelo de datos](../../docs/data-model.md)
