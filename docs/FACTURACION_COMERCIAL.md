# Facturacion comercial interna

La facturacion comercial es un registro administrativo interno. No procesa
tarjetas ni se conecta con pasarelas de pago.

## Estados

- `PRUEBA`: uso normal y aviso de dias restantes.
- `ACTIVA`: uso normal.
- `VENCIDA`: aviso fuerte, sin corte automatico de la operacion.
- `SUSPENDIDA`: conserva lectura y datos, pero rechaza nuevas altas.
- `CANCELADA` o organizacion `BAJA`: conserva toda la informacion historica y
  no permite operacion nueva.

Solo el Maestro cambia planes, estados y vencimientos, registra cobros o anula
un registro. El Administrador de Organizacion puede ver el aviso de su cuenta,
pero no reactivarse ni modificar condiciones comerciales.

## Cobros manuales

Cada cobro registra fecha, periodo, importe, moneda, medio, referencia y notas.
Una correccion no elimina el registro: se marca `ANULADO` y queda trazabilidad.
No se almacenan datos de tarjetas.

## Suspension prudente

La suspension explicita bloquea `INSERT` en las tablas operativas principales
mediante triggers. No borra ni modifica pacientes, turnos, historias,
documentos o usuarios existentes. El Maestro nunca queda bloqueado.

El vencimiento por fecha se calcula al consultar la cuenta. Se muestra como
alerta, pero requiere una suspension explicita del Maestro para cortar nuevas
operaciones. Esto evita cortes accidentales por una fecha mal cargada.

## Preparacion para pasarelas futuras

`commercial_payments.reference`, `payment_method`, moneda y periodos permiten
incorporar mas adelante identificadores de Mercado Pago o Stripe sin guardar
datos sensibles de tarjetas ni cambiar el historial comercial.
