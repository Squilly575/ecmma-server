const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// Load Firebase credentials from environment variable
const serviceAccountJSON = process.env.SERVICE_ACCOUNT_JSON;

if (!serviceAccountJSON) {
  console.error("SERVICE_ACCOUNT_JSON is not set!");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJSON);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const port = 3000;

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(cors());
app.use(express.json()); // Allow parsing JSON in POST requests

// GET endpoint to fetch all sign-ins for a given date
app.get('/signins/:date', async (req, res) => {
  const { date } = req.params; // Expected format: YYYY-MM-DD
  const result = {};

  try {
    const dayDocRef = db.collection('class_signins').doc(date);
    const classCollections = await dayDocRef.listCollections();

    for (const classCollection of classCollections) {
      const className = classCollection.id;
      const classDocs = await classCollection.get();

      result[className] = classDocs.docs.map(doc => doc.data());
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching sign-ins:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET endpoint to check milestone achievements based on total BJJ classes
app.get('/milestones', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const milestones = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const gi = data.giCount ?? 0;
      const nogi = data.nogiCount ?? 0;
      const total = gi + nogi;
      const milestone = data.totalMilestone ?? 0;

      if (total > milestone && total % 25 === 0) {
        milestones.push({
          name: data.displayName ?? data.email,
          type: 'Total BJJ Classes',
          count: total,
        });

        // Update user milestone to prevent duplicate notifications
        await doc.ref.update({ totalMilestone: total });
      }
    }

    res.json(milestones);
  } catch (error) {
    console.error('Error checking milestones:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST endpoint to record a sign-in and update user class count
app.post('/signins', async (req, res) => {
  const { name, uid, className, time, type, timestamp } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    // Save the sign-in
    await db
      .collection('class_signins')
      .doc(today)
      .collection(className)
      .doc(uid)
      .set({
        name,
        time,
        type,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
      });

    // Get user doc
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    const userData = userDoc.exists ? userDoc.data() : {};
    const giCount = userData?.giCount || 0;
    const nogiCount = userData?.nogiCount || 0;

    let updatedFields = {};

    if (className.toLowerCase().includes('no-gi')) {
      updatedFields.nogiCount = nogiCount + 1;
    } else if (className.toLowerCase().includes('gi')) {
      updatedFields.giCount = giCount + 1;
    }

    await userRef.set(updatedFields, { merge: true });

    res.status(200).send({ message: 'Sign-in recorded and count updated.' });
  } catch (error) {
    console.error('Error recording sign-in:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});