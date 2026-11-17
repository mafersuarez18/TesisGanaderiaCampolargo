import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { respuestaExito } from '../../compartido/utilidades/respuestaHttp';
import {
  verificarToken,
  requerirPrivilegio,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import { ErrorNoEncontrado } from '../../compartido/tipos/respuesta';
import {
  controladorListarCalendarios,
  controladorObtenerCalendario,
  controladorCrearCalendario,
  controladorActualizarCalendario,
  controladorListarRegistros,
  controladorRegistrarVacunacion,
  controladorActualizarRegistro,
  controladorEliminarRegistro,
  controladorListarMedicamentos,
  controladorCrearMedicamento,
  controladorCumplimientoPorLote,
  controladorVerificarAplicabilidad,
} from './vacunacion.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// El módulo cubre tres cosas relacionadas pero distintas: el catálogo de
// medicamentos, los calendarios de vacunación (qué se aplica y cada
// cuánto) y los registros de cada aplicación concreta.

// Medicamentos (catálogo)
enrutador.get('/medicamentos', requerirPrivilegio('vacunacion.ver'), controladorListarMedicamentos);
// Registrar un medicamento nuevo al vuelo (usado desde el formulario de
// desparasitación cuando el producto escrito no existe en el catálogo)
enrutador.post('/medicamentos', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Registrar medicamento', 'Medicamento'), controladorCrearMedicamento);

// Calendarios de vacunación
enrutador.get('/calendarios', requerirPrivilegio('vacunacion.ver'), controladorListarCalendarios);
enrutador.get('/calendarios/:id', requerirPrivilegio('vacunacion.ver'), controladorObtenerCalendario);
// GET /api/vacunacion/calendarios/:id/aplica?animalId= — si el calendario le
// corresponde al animal (sexo, edad, propósito, condición reproductiva)
enrutador.get('/calendarios/:id/aplica', requerirPrivilegio('vacunacion.ver'), controladorVerificarAplicabilidad);
enrutador.post('/calendarios', requerirPrivilegio('vacunacion.gestionar_calendario'), registrarAuditoria('Crear calendario vacunación', 'CalendarioVacunacion'), controladorCrearCalendario);
enrutador.patch('/calendarios/:id', requerirPrivilegio('vacunacion.gestionar_calendario'), registrarAuditoria('Actualizar calendario vacunación', 'CalendarioVacunacion'), controladorActualizarCalendario);

// GET /api/vacunacion/cumplimiento-por-lote
enrutador.get('/cumplimiento-por-lote', requerirPrivilegio('vacunacion.ver'), controladorCumplimientoPorLote);

// Registros de vacunación aplicada
// Vitaminas aplicadas (historial propio; se muestran junto a las aplicaciones)
enrutador.get('/vitaminas', requerirPrivilegio('vacunacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { animalId } = z.object({ animalId: z.string().optional() }).parse(req.query);
    const vitaminas = await prisma.registroVitaminas.findMany({
      where: { ...(animalId && { animalId }) },
      include: {
        animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
        medicamento: { select: { id: true, nombre: true, principioActivo: true } },
        veterinario: { select: { id: true, nombre: true, apellido: true } },
        historialMedico: { select: { id: true, fechaConsulta: true, motivoConsulta: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 50,
    });
    return respuestaExito(res, vitaminas);
  } catch (error) { return next(error); }
});

// Datos de una aplicación: los usa la alerta de vacuna próxima o vencida para
// abrir el registro de la nueva dosis prellenado con la anterior
enrutador.get('/registros/:id', requerirPrivilegio('vacunacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const registro = await prisma.registroVacunacion.findUnique({
      where: { id: req.params['id'] as string },
      select: {
        id: true, animalId: true, calendarioVacunacionId: true, proximaFecha: true,
        fechaAplicacion: true, dosis: true, viaAdministracion: true, lote: true,
      },
    });
    if (!registro) throw new ErrorNoEncontrado('Registro de vacunación');

    // Dato que la aplicación anterior no tenga: el de la aplicación más
    // reciente de la misma vacuna que sí lo registró
    const completar = async (campo: 'dosis' | 'viaAdministracion' | 'lote') => {
      if (registro[campo]) return registro[campo];
      const otra = await prisma.registroVacunacion.findFirst({
        where: { calendarioVacunacionId: registro.calendarioVacunacionId, [campo]: { not: null } },
        orderBy: { fechaAplicacion: 'desc' },
        select: { [campo]: true },
      });
      return (otra as Record<string, string | null> | null)?.[campo] ?? null;
    };
    const [dosis, viaAdministracion, lote] = await Promise.all([
      completar('dosis'), completar('viaAdministracion'), completar('lote'),
    ]);
    return respuestaExito(res, { ...registro, dosis, viaAdministracion, lote });
  } catch (error) { return next(error); }
});

enrutador.get('/', requerirPrivilegio('vacunacion.ver'), controladorListarRegistros);
enrutador.post('/', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Registrar vacunación', 'RegistroVacunacion'), controladorRegistrarVacunacion);
enrutador.patch('/:id', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Actualizar registro vacunación', 'RegistroVacunacion'), controladorActualizarRegistro);
enrutador.delete('/:id', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Eliminar registro vacunación', 'RegistroVacunacion'), controladorEliminarRegistro);

export default enrutador;
