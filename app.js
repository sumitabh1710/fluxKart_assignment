const express = require("express");
const { setupDatabase, pool } = require("./src/db_setup");
const bodyParser = require("body-parser");

const app = express();
const cors = require("cors");

app.use(cors());

setupDatabase();

app.use(bodyParser.json());

app.post("/identify", async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    const orQuery = `
      SELECT *
      FROM contacts
      WHERE (email = $1 OR phoneNumber = $2)
    `;
    const andQuery = `
      SELECT *
      FROM contacts
      WHERE (email = $1 AND phoneNumber = $2)
    `;
    const values = [email, phoneNumber];

    const andResult = await pool.query(andQuery, values);

    if (andResult.rows.length == 0) {
      const intialResult = await pool.query(orQuery, values);

      if (intialResult.rows == 0) {
        const insertQuery = `
        INSERT INTO contacts (email, phoneNumber, linkPrecedence)
        VALUES ($1, $2, 'primary')
      `;
        const insertValues = [email, phoneNumber];
        await pool.query(insertQuery, insertValues);
      } else {
        if (intialResult.rows[0].linkprecedence == "primary") {
          const primaryContact = intialResult.rows.filter(
            (each) => each.linkprecedence == "primary"
          );
          if (primaryContact.length == 1) {
            const insertQuery = `
              INSERT INTO contacts (email, phoneNumber, linkedId, linkPrecedence)
              VALUES ($1, $2, $3, 'secondary')
        `;
            const insertValues = [email, phoneNumber, primaryContact[0].id];
            await pool.query(insertQuery, insertValues);
          } else {
            const updateQuery = `
              UPDATE contacts
              SET linkPrecedence = 'secondary', linkedId = $1
              WHERE id = $2
        `;
            const updateValue = [primaryContact[0].id, primaryContact[1].id];
            await pool.query(updateQuery, updateValue);
          }
        } else if (intialResult.rows[0].linkprecedence == "secondary") {
          const insertQuery = `
        INSERT INTO contacts (email, phoneNumber, linkedId, linkPrecedence)
        VALUES ($1, $2, $3, 'secondary')
      `;
          const insertValues = [
            email,
            phoneNumber,
            intialResult.rows[0].linkedid,
          ];
          await pool.query(insertQuery, insertValues);
        }
      }
    }

    const finalResult = await pool.query(orQuery, values);
    let primaryContactId = finalResult.rows[0].id;
    let emails = new Set();
    let phoneNumbers = new Set();
    let secondaryContactIds = new Set();

    finalResult.rows.forEach((each) => {
      emails.add(each.email);
      phoneNumbers.add(each.phonenumber);
      if (each.linkedid != null) {
        secondaryContactIds.add(each.id);
      }
    });

    const contactsResponse = {
      contact: {
        primaryContatctId: primaryContactId,
        emails: [...emails],
        phoneNumbers: [...phoneNumbers],
        secondaryContactIds: [...secondaryContactIds],
      },
    };

    return res.status(200).json(contactsResponse);
  } catch (error) {
    console.error("Error identifying contact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
