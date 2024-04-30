const { Sequelize } = require('sequelize')

let database = process.env.DB_DATABASE;
let user = process.env.DB_USER;
let password = process.env.DB_PASSWORD;

const sequelize = new Sequelize(database, user, password, {
    host: 'localhost',
    dialect: 'mysql'
});


module.exports = sequelize;