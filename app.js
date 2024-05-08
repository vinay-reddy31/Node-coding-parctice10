const path = require('path')
const express = require('express')
const app = express()

app.use(express.json())
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
let db = null
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server started at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()
const getCamelCase = state => {
  return {
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  }
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}
app.post('/login/', authenticateToken, async (request, response) => {
  const {username, password} = request.body
  const userQuery = `select * from user where username='${username}';`
  const getUser = await db.get(userQuery)
  if (getUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, getUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `select * from State;`
  const getStates = await db.all(getStatesQuery)
  response.send(getStates.map(state => getCamelCase(state)))
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `select * from State where state_id=${stateId};`
  const getState = await db.get(getStateQuery)
  response.send(getCamelCase(getState))
})

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const createDistrictQuery = `
  insert into District(district_name,state_id,cases,cured,active,deaths) values
  ('${districtName}',${stateId},${cases},${cured},${active},${deaths});`
  await db.run(createDistrictQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `select * from District where district_id=${districtId};`
    const getDistrict = await db.get(getDistrictQuery)
    response.send({
      districtId: getDistrict.district_id,
      districtName: getDistrict.district_name,
      stateId: getDistrict.state_id,
      cases: getDistrict.cases,
      cured: getDistrict.cured,
      active: getDistrict.active,
      deaths: getDistrict.deaths,
    })
  },
)

app.delete(
  '/districts/:districtId',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `delete from District where district_id=${districtId};`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId',
  authenticateToken,
  async (request, response) => {
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const {districtId} = request.params
    const updateDistrictQuery = `
update District set district_name='${districtName}',state_id=${stateId},
cases=${cases},cured=${cured},active=${active},deaths=${deaths} where district_id=${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatsQuery = `select sum(cases)as totalCases,sum(cured)as totalCured,
 sum(active)AS totalActive,sum(deaths)as totalDeaths from District where state_id=${stateId}
 group by state_id;`
    const getStats = await db.get(getStatsQuery)
    response.send(getStats)
  },
)

module.exports = app
