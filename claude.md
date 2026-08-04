# Proyecto

Nombre: Mesero IA

## Objetivo

Construir un SaaS para restaurantes que permita atender clientes mediante IA utilizando un código QR por mesa.

La IA NO reemplaza al restaurante.

La IA representa al restaurante utilizando únicamente la información proporcionada por éste.

Siempre priorizar simplicidad, rapidez y facilidad de uso.

---

# Stack tecnológico

Frontend
- React
- TypeScript
- Vite

Backend
- Supabase

Base de datos
- PostgreSQL (Supabase)

IA
- Gemini API

Deploy
- Vercel

---

# Filosofía del desarrollo

Este proyecto es un MVP.

No desarrollar funciones innecesarias.

Cada función debe resolver un problema real dentro de la operación del restaurante.

Antes de agregar cualquier característica preguntarse:

"¿Esto realmente ayuda al restaurante o solamente hace el sistema más complejo?"

Si la respuesta es "no ayuda", no implementarla.

---

# Tipos de usuario

## 1. Owner

Existe únicamente un Owner.

El Owner administra toda la plataforma.

Funciones:

- Crear restaurantes.
- Crear cuentas para restaurantes.
- Editar restaurantes.
- Suspender restaurantes.
- Eliminar restaurantes.
- Acceder a toda la información del sistema.

No existe registro público.

El Owner crea manualmente las cuentas.

---

## 2. Restaurante

Cada restaurante posee un usuario y contraseña.

NO habrá autenticación mediante correo electrónico.

NO habrá verificación de correo.

NO habrá recuperación de contraseña por email.

El restaurante únicamente administra su propio negocio.

Funciones:

- Editar información del restaurante.
- Administrar menú.
- Crear categorías.
- Crear productos.
- Subir imágenes.
- Agregar ingredientes.
- Definir ingredientes modificables.
- Definir alérgenos.
- Configurar políticas.
- Crear mesas.
- Generar QR.
- Ver pedidos.

Nunca podrá acceder a información de otros restaurantes.

---

## 3. Cliente

El cliente NO tiene cuenta.

NO inicia sesión.

NO necesita registrarse.

Simplemente escanea un código QR.

El QR identifica automáticamente:

- Restaurante
- Mesa

El cliente podrá:

- Ver menú.
- Hablar con la IA.
- Agregar productos.
- Confirmar pedido.

Nada más.

---

# Flujo del sistema

Owner

↓

Crea restaurante

↓

Asigna usuario y contraseña

↓

Entrega acceso al restaurante

↓

Restaurante configura toda su información

↓

Genera QR por mesa

↓

Imprime QR

↓

Cliente escanea QR

↓

La IA atiende al cliente

↓

Pedido llega al restaurante asociado a la mesa correcta.

---

# Menú

Cada producto deberá contener:

- Nombre
- Categoría
- Precio
- Imagen
- Descripción
- Ingredientes
- Ingredientes modificables
- Alérgenos
- Tiempo estimado de preparación

Ejemplo

Hamburguesa

Ingredientes

- Pan
- Carne
- Queso
- Cebolla
- Pepinillos

Ingredientes modificables

✅ Cebolla

✅ Pepinillos

❌ Carne

❌ Pan

---

# Información para IA

Cada restaurante alimentará a la IA mediante un panel.

Ejemplos:

- Historia del restaurante.
- Platillos estrella.
- Políticas.
- Promociones.
- Horarios.
- Preguntas frecuentes.
- Recomendaciones.
- Restricciones.
- Información importante.

La IA únicamente responderá utilizando esta información.

Nunca inventará respuestas.

---

# Políticas

La IA debe conocer reglas como:

- No dividir cuentas.
- Cocina compartida para mariscos.
- Platillos que no aceptan modificaciones.
- Horarios.
- Tiempo promedio de preparación.
- Restricciones específicas.

La IA nunca prometerá algo que el restaurante no haya autorizado.

---

# Mesas

Cada restaurante administrará sus mesas.

Ejemplo

Mesa 1

Mesa 2

Mesa 3

...

Cada mesa tendrá un QR único.

El sistema generará automáticamente los QR.

El restaurante podrá descargar un PDF listo para imprimir.

El cliente nunca deberá indicar el número de mesa manualmente.

---

# Pedidos

Cada pedido deberá almacenar:

- Restaurante
- Mesa
- Productos
- Modificaciones autorizadas
- Hora
- Estado

Ejemplo

Mesa 7

2 Hamburguesas

Sin cebolla

1 Coca-Cola

Estado

Pendiente

---

# MVP

Desarrollar únicamente:

✅ Login Owner

✅ Login Restaurante

✅ Dashboard Restaurante

✅ Administración del menú

✅ Administración de ingredientes

✅ Administración de políticas

✅ Administración de mesas

✅ Generación automática de QR

✅ Cliente escanea QR

✅ Chat IA

✅ Confirmación del pedido

✅ Lista de pedidos

No desarrollar todavía:

❌ Pagos

❌ Reservaciones

❌ Programa de puntos

❌ Reportes

❌ Analytics

❌ Promociones automáticas

❌ Fidelización

Estas funciones serán desarrolladas después de validar el producto.

---

# Principios de programación

- Código limpio.
- Componentes reutilizables.
- Arquitectura modular.
- Escalable.
- Explicar siempre las decisiones importantes.
- Nunca asumir información que no haya sido definida.
- Si existe una duda sobre el flujo del negocio, preguntar antes de implementar.
