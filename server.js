require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs'); // ✅ Added
const path = require('path'); // ✅ Added
const { Pool } = require('pg');

const app = express();
app.use(express.json()); // This is essential
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors());

// Middleware to verify API key from header or query param
const authenticateApiKey = (req, res, next) => {
  const keyFromClient = req.header('x-api-key') || req.query.api_key;
  const validKey = process.env.API_KEY;

  if (keyFromClient !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  next(); // Allow the request to proceed
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync("./certs/ca.pem").toString(),
  },
});
// Create table on server start
app.get('/create', async (req, res) => {
  const query = `
    CREATE TABLE IF NOT EXISTS count_data_table (
      date DATE PRIMARY KEY,
      tf_count INT,
      da_count INT
    );
  `;
  try {
    await pool.query(query);
    res.status(200).json({ message: "✅ Table created or already exists." });
  } catch (err) {
    console.error('Error creating table:', err);
    res.status(500).send('Error creating one or more tables.');
  }
});

app.post('/api/add', authenticateApiKey, async (req, res) => {
    const { date, tf_count, da_count } = req.body;
    try {
      await pool.query(
        'INSERT INTO count_data_table (date, tf_count, da_count) VALUES (TO_DATE($1, \'DD/MM/YYYY\'), $2, $3)',
        [date, tf_count, da_count]
      );
      res.json({ message: 'Data inserted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to insert data' });
    }
});
  
app.get('/api/all/data', authenticateApiKey, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT TO_CHAR(date, 'DD/MM/YYYY') as date, tf_count, da_count 
        FROM count_data_table 
        ORDER BY date
      `);
      res.json(result.rows); // Returns array of JSON objects
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

app.get('/api/data', authenticateApiKey, async (req, res) => {
    const inputDate = req.query.date; // e.g., '06/05/2025'
  
    if (!inputDate) {
      return res.status(400).json({ error: 'Date is required as query param' });
    }
  
    try {
      const result = await pool.query(
        `SELECT TO_CHAR(date, 'DD/MM/YYYY') AS date, tf_count, da_count 
         FROM count_data_table 
         WHERE date = TO_DATE($1, 'DD/MM/YYYY')`,
        [inputDate]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'No data found for this date' });
      }
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve data' });
    }
});


app.put('/api/update', authenticateApiKey, async (req, res) => {
  const inputDate = req.query.date;  // Get the date from the query parameter (e.g., ?date=06/05/2025)
  const { tf_count, da_count } = req.body;

  if (!inputDate || !tf_count || !da_count) {
    return res.status(400).json({ error: 'Date, tf_count, and da_count are required' });
  }

  try {
    // Step 1: Find the existing data by date
    const result = await pool.query(
      `SELECT * FROM count_data_table WHERE date = TO_DATE($1, 'DD/MM/YYYY')`,
      [inputDate]
    );

    // Step 2: If no data is found, return a 404 error
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No record found for this date' });
    }

    // Step 3: Update the data if found
    const updatedResult = await pool.query(
      `UPDATE count_data_table 
       SET tf_count = $2, da_count = $3 
       WHERE date = TO_DATE($1, 'DD/MM/YYYY') 
       RETURNING TO_CHAR(date, 'DD/MM/YYYY') as date, tf_count, da_count`,
      [inputDate, tf_count, da_count]
    );

    // Step 4: Return the updated record
    res.json({ message: 'Data updated successfully', updated: updatedResult.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

app.delete('/api/delete', authenticateApiKey, async (req, res) => {
  const inputDate = req.query.date; // e.g., ?date=06/05/2025

  if (!inputDate) {
    return res.status(400).json({ error: 'Date is required as query param' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM count_data_table 
       WHERE date = TO_DATE($1, 'DD/MM/YYYY') 
       RETURNING TO_CHAR(date, 'DD/MM/YYYY') as date`,
      [inputDate]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No record found for this date' });
    }

    res.json({ message: 'Record deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

app.get('/api', authenticateApiKey, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT TO_CHAR(date, 'DD/MM/YYYY') as date, tf_count, da_count 
        FROM count_data_table 
        ORDER BY date
      `);
      res.json({ message : "Server Online"}); // Returns array of JSON objects
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve data' });
    }
});



app.listen(5000, async () => {
  console.log('Server running on port 5000');
});
