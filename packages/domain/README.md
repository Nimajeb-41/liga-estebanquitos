# @liga/domain

Motor de competicion de la Liga Estabanquitos. TypeScript puro: **sin
dependencias de runtime**, sin base de datos, sin HTTP.

```
src/
├── errors.ts       DomainError con codigos estables
├── tournament/     Maquina de estados y configuracion del reglamento
├── roster/         Participantes, plazas y sustituciones
├── fixture/        Generador round-robin, sorteo reproducible y validador
├── results/        Validacion de marcadores y derivacion del resultado
├── scoring/        Puntos a partir del resultado
├── sanctions/      Sanciones y anulaciones
├── standings/      Estadisticas, desempates y clasificacion
└── labels/         Abreviaturas en espanol (PJ, VG, VP, DC, PTS)
```

```bash
npm test --workspace=@liga/domain
```

Documentacion: [reglamento](../../docs/tournament-rules.md) ·
[fixture](../../docs/fixture-system.md) · [testing](../../docs/testing.md)
