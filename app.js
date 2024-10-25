
// Ejemplo de estructura de horarios dinámica
const horarios = [
    {
        tipo: "particular",
        selector: "129",
        hora: { entrada1: "08:30", salida1: "12:30", entrada2: "15:30", salida2: "19:00" }
    },
    {
        tipo: "grupo",
        selector: "ADMINISTRACION",
        hora: { entrada1: "08:30", salida1: "13:00", entrada2: "14:00", salida2: "18:00" }
    },
    {
        tipo: "grupo",
        selector: "TALLER",
        hora: { entrada1: "09:00", salida1: "12:30", entrada2: "15:00", salida2: "19:00" }
    },
    {
        tipo: "default",
        selector: "DEFAULT",
        hora: { entrada1: "08:30", salida1: "18:00" }  // Otros usuarios
    }
];

// Función para obtener el horario adecuado según el ID de usuario o el departamento
function obtenerHorario(userId, departamento) {
    // Buscar horario particular para el usuario
    const horarioParticular = horarios.find(h => h.tipo === "particular" && h.selector === userId);
    
    // Si no hay horario particular, buscar por grupo (departamento)
    const horarioGrupo = horarios.find(h => h.tipo === "grupo" && h.selector === departamento);
    
    // Si no hay horario particular ni de grupo, usar el horario por defecto
    const horarioDefault = horarios.find(h => h.tipo === "default");

    // Priorizar particular, luego grupo, y finalmente el default
    return horarioParticular ? horarioParticular.hora : (horarioGrupo ? horarioGrupo.hora : horarioDefault.hora);
}

// Cargar el archivo Excel
function loadExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

// Función para convertir una cadena de fecha/hora en objeto Date
function parseDate(dateTimeString) {
    return new Date(dateTimeString);
}

// Función para redondear el tiempo a intervalos de 10 minutos
function roundToTenMinutes(date) {
    const minutes = Math.floor(date.getMinutes() / 10) * 10;
    const roundedDate = new Date(date);
    roundedDate.setMinutes(minutes, 0, 0); // Redondear minutos y resetear segundos
    return roundedDate;
}

// Función para filtrar registros, conservando solo el primero dentro de cada periodo de 10 minutos por usuario
function filterRecords(records) {
    const filteredRecords = [];
    const userLastTimestamps = {};  // Último registro de tiempo por usuario

    records.forEach(record => {
        const { 'Nro. de usuario': userId, 'Fecha/Hora': dateTime } = record;

        if (!userId || !dateTime) {
            return; // Saltar registros inválidos
        }

        const recordTime = parseDate(dateTime);
        const roundedTime = roundToTenMinutes(recordTime); // Redondear a 10 minutos

        // Verificar si hay un último registro para este usuario
        if (!userLastTimestamps[userId] || (roundedTime - userLastTimestamps[userId] >= 600000)) {
            // Si no hay un registro anterior o han pasado más de 10 minutos
            filteredRecords.push(record); // Guardar el registro
            userLastTimestamps[userId] = roundedTime; // Actualizar el tiempo del último registro válido
        }
    });

    return filteredRecords;
}

// Función para calcular la diferencia entre horario real y esperado
function compareTime(realTime, expectedTime) {
    const realDate = new Date(`1970-01-01T${realTime}:00`);
    const expectedDate = new Date(`1970-01-01T${expectedTime}:00`);
    const diff = (realDate - expectedDate) / 60000; // Diferencia en minutos

    if (diff < 0) {
        return `temprano por ${Math.abs(diff)} minutos`;
    } else if (diff > 0) {
        return `tarde por ${diff} minutos`;
    } else {
        return "a tiempo";
    }
}

// Función para organizar registros por fechas
function processRecords(records) {
    const filteredRecords = filterRecords(records);  // Filtrar los registros primero
    const processedRecords = [];

    filteredRecords.forEach(record => {
        const { 'Nro. de usuario': userId, Departamento: departamento, 'Fecha/Hora': dateTime, Nombre: nombre } = record;
        const recordTime = parseDate(dateTime);
        const date = recordTime.toISOString().split('T')[0]; // Extraer solo la fecha

        // Obtener horario dinámico según usuario o departamento
        const horarioUsuario = obtenerHorario(userId, departamento);

        let currentEntry = processedRecords.find(r => r.fecha === date && r.idUsuario === userId);
        if (!currentEntry) {
            currentEntry = { fecha: date, departamento, nombre, idUsuario: userId, entrada1: "", salida1: "", entrada2: "", salida2: "", entrada1_sin: "", salida1_sin: "", entrada2_sin: "", salida2_sin: "" };
            processedRecords.push(currentEntry);
        }

        // Asignar entrada y salida según el orden de aparición
        if (!currentEntry.entrada1) {
            currentEntry.entrada1 = recordTime.toTimeString().substring(0, 5);
        } else if (!currentEntry.salida1 && !currentEntry.entrada2) {
            currentEntry.salida1 = recordTime.toTimeString().substring(0, 5);
        } else if (!currentEntry.entrada2) {
            currentEntry.entrada2 = recordTime.toTimeString().substring(0, 5);
        } else if (!currentEntry.salida2) {
            currentEntry.salida2 = recordTime.toTimeString().substring(0, 5);
        }
    });

    // Comparar las horas registradas con los horarios esperados
    processedRecords.forEach(record => {
        const horarioUsuario = obtenerHorario(record.idUsuario, record.departamento);

        // Si solo hay una entrada y una salida, comparar con entrada1 y salida2
        if (record.entrada1 && !record.entrada2 && record.salida1 && !record.salida2) {
            record.entrada1_sin = compareTime(record.entrada1, horarioUsuario.entrada1);
            record.salida1_sin = compareTime(record.salida1, horarioUsuario.salida2);  // Comparar con salida2 en lugar de salida1
        } else {
            // Si hay dos entradas y salidas, comparar con los horarios correspondientes
            if (record.entrada1) {
                record.entrada1_sin = compareTime(record.entrada1, horarioUsuario.entrada1);
            }
            if (record.salida1) {
                record.salida1_sin = compareTime(record.salida1, horarioUsuario.salida1);
            }
            if (record.entrada2) {
                record.entrada2_sin = compareTime(record.entrada2, horarioUsuario.entrada2);
            }
            if (record.salida2) {
                record.salida2_sin = compareTime(record.salida2, horarioUsuario.salida2);
            }
        }
    });

    return processedRecords;
}

// Función para guardar el resultado en un nuevo archivo Excel
function saveToExcel(data, outputFilePath) {
    const newWorkbook = xlsx.utils.book_new();
    const newSheet = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(newWorkbook, newSheet, 'ProcessedRecords');
    xlsx.writeFile(newWorkbook, outputFilePath);
}



document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const fileInput = document.getElementById('file');
    const file = fileInput.files[0];

    if (file) {
        const reader = new FileReader();

        // Leer el archivo como binary string
        reader.readAsBinaryString(file);

        reader.onload = function (e) {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });

            // Suponiendo que el archivo tiene una única hoja de cálculo
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Convertir la hoja de cálculo a un array de objetos JSON
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            // Aquí puedes procesar los datos según tu lógica
            const processedData = processRecords(jsonData);

            // Crear un nuevo libro de trabajo y hoja con los datos procesados
            const newWorkbook = XLSX.utils.book_new();
            const newSheet = XLSX.utils.json_to_sheet(processedData);
            XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'ProcessedData');

            // Exportar el archivo procesado
            XLSX.writeFile(newWorkbook, 'processed_file.xlsx');
        };
    }
});

// Función para procesar los datos (aquí debes implementar la lógica de procesamient
