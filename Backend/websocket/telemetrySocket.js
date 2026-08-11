let ioInstance;

const initWebSocket = (io) => {
    ioInstance = io;

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
};

const getIo = () => {
    if (!ioInstance) {
        throw new Error('Socket.io is not initialized!');
    }
    return ioInstance;
};

module.exports = {
    initWebSocket,
    getIo
};
