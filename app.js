require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT;
const { Pool } = require('pg');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    }
});

// Store processed event IDs in-memory (temporary storage)
let processedEventIds = new Set();
// Object to store webhook data
let latestWebhookData = {};

//object to store questions for booking
let allQuestions = [];

//same as latestwebhookData. using it to display webhook on web
let webhookJSON = {};
// Handle Xola webhook
app.post('/webhook', async(req, res) => {
    console.log('Webhook received:');
    webhookJSON = req.body;

    // Collect all experiences (names) from the array of items
    const notes = req.body.data.notes.map(note => note?.text ?? null);
     allQuestions = [];
     individualWebhook = [];
// Initialize arrays to store multiple values
    const experiences = [];
    const experiencesID = [];
    const bookedDate = [];
    const quantity = [];
    const notesArray = [];
    const addons1Array = [];
    const addons2Array = [];
    const amountArray = [];

    // Helper functions to identify themes and locations from addons in JSON
    const isTheme = (addon) => addon?.toLowerCase()?.includes("themes");
    const isLocation = (addon) => addon?.toLowerCase()?.includes("location");

     // Loop through each item in the `items` array and collect values
     req.body.data.items.forEach(item => {
        experiences.push(item?.name ?? null); // Collect experiences
        experiencesID.push(item?.id ?? null); // collect id for each experience
        bookedDate.push(item?.arrival?? null); // Collect arrivalDatetime for each item
        quantity.push(item?.quantity?? null); // select the quantity
        amountArray.push(item?. amount ?? null);
      //  addons1Array.push(item?.addOns?.[0]?.configuration?.name ?? null); // Collect Addons1 name
      //addons2Array.push(item?.addOns?.[1]?.configuration?.name ?? null); // Collect Addons2 name
        
      let latestTheme = null; // Temporary variable to store the latest theme for the current item
      let latestLocation = null; // Temporary variable to store the latest location for the current item
  
 // Loop through all addons
 const addons = item?.addOns ?? [];
 for (const addon of addons) {
     const addonName = addon?.configuration?.name ?? null;
     if (addonName) {
         if (isTheme(addonName)) {
             latestTheme = addonName; // Overwrite latestTheme as we iterate
         } else if (isLocation(addonName)) {
             latestLocation = addonName; // Overwrite latestLocation as we iterate
         }
     }
 }

 // Push the latest theme for the current item to addons1Array
 if (latestTheme) {
    addons1Array.push(latestTheme);
} else {
    addons1Array.push(null); // If no theme is found, push null to maintain alignment
}

// Push the latest location for the current item to addons2Array
if (latestLocation) {
    addons2Array.push(latestLocation);
} else {
    addons2Array.push(null); // If no location is found, push null to maintain alignment
}

            // Check if guestsData exists and is an array
        let questionArray = [];
            if (Array.isArray(item?.guestsData)) {
        item.guestsData.forEach(guest => {
            // Check if fields exist and is an array
            if (Array.isArray(guest?.fields)) {
                guest.fields.forEach(field => {
                    // Push each field's value if it exists, otherwise push null
                    questionArray.push(field?.value ?? null);
                });
            }
        });
    }
    else{
        questionArray.push(null);
    }
    allQuestions.push({ Questions: questionArray });
    });

// Access Questions1 and Questions2 and Question3
    const Questions1 = allQuestions[0]?.Questions ?? null;
    const Questions2 = allQuestions.length > 1 ? allQuestions[1]?.Questions ?? 0 : 0;
    const Questions3 = allQuestions.length > 2 ? allQuestions[2]?.Questions ?? 0 : 0;

    req.body.data.notes.forEach(note => {
        notesArray.push(note?.text ?? null);
    });


// Store the received data
    latestWebhookData = {
        eventName: req.body.eventName ?? null,
        orderStatus: req.body.data.items[0].status ?? null,
        id: req.body.data.id ?? null,
        paymentMethod: req.body.data.adjustments[1]?.meta?.paymentMethod?? null,
        paymentType: req.body.data.adjustments[1]?.meta?.payment?.method ?? null,
        customerName: req.body.data.customerName ?? null,
        customerEmail: req.body.data.customerEmail ?? null,
        phone: req.body.data.phone ?? null,
        amount: req.body.data.amount ?? null,
        amountArr: amountArray,
        ExperiencesID: experiencesID,
        Experiences: experiences,
        Quantity: quantity,
        arrivalDate: bookedDate, // Array of all createdAt times
        notes: notesArray, // Array of all notes
        addons1: addons1Array, // Array of all Addons1 names
        addons2: addons2Array, // Array of all Addons2 names
        Questions1: Questions1,
        Questions2: Questions2, // array of questions
        Questions3: Questions3, // array of questions
    };

    // xola update caused issue of triggering webhook multiple times
    // so this keeps track of xola booking id to ensure that it is not repeated twice
    if (processedEventIds.has(latestWebhookData.id)) {
        console.log('Webhook already processed:', latestWebhookData.id);
        // Print out all the processed event IDs
        console.log('All processed event IDs:', Array.from(processedEventIds));
        return res.status(200).send('OK');// Acknowledge receipt but don't process
    }

    // Mark this event as processed
    processedEventIds.add(latestWebhookData.id);
    // Print out all the processed event IDs
    console.log('after 1st add processed event IDs:', Array.from(processedEventIds));

    //Debug statement
    // prints out stored data
    console.log('Stored webhook data:', JSON.stringify(latestWebhookData, null, 2));

    const client = await pool.connect();

    // Dynamically populate specifiedValues(professional learning experiences) from the database
    const specifiedValues = await getSpecifiedValues(client);

     // Dynamically populate YouthExperiencePrograms(youth experiences) from the database
    const YouthExperiencePrograms = await getYouthExperiences(client);

    /**
    //Array with all the name of professional learning 
    const specifiedValues = [
        "professional learning workshop (1-2 hours)",
        "professional learning outdoors - half day",
        "professional learning outdoors - half day x 2 (am + pm)",
        "professional learning outdoors - full day"
      ];
       */

    // Start checking for specified values in experiences
    const hasSpecifiedValues = latestWebhookData.Experiences.some(experience =>
        specifiedValues.includes(experience.toLowerCase())
    );
    
    // Start checking for YouthExperiencePrograms values in experiences
    const hasYE = latestWebhookData.Experiences.some(experience =>
        YouthExperiencePrograms.includes(experience.toLowerCase())
    );

    // If professioinal learning is detected execute if part below
    // IF not try else if
    if (hasSpecifiedValues) {
        // Connection request for database
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // if the order has not been approved(accepted) by admin in xola
            // do nothing
            if(latestWebhookData.orderStatus < 200){
                console.log('status is < 200');
                processedEventIds.clear();
                return res.status(200).send('OK');
            }

            //Check if the webhook received is update and status value !=700 (update to Canceled booking)
            if (
                (latestWebhookData.eventName === 'order.update' || latestWebhookData.eventName === 'order.cancel') &&
                ((latestWebhookData.orderStatus >= 200 && latestWebhookData.orderStatus <= 300) || latestWebhookData.orderStatus === 700)
            ) {
            let schoolId = null;
            
            //Logic to get total number of classes 
            const totalClasses = latestWebhookData.Quantity.length;
            console.log('Number of classes in professional learning: ' + totalClasses )
            console.log(''); // Blank line
            
            // call Invoice function and store invoiceId
            const invoiceId = await Invoice(client, latestWebhookData);
            console.log(' Professional invoice ID:', invoiceId); 
            console.log(''); // Blank line
            
            // call getOrganizationId function and store organizationId
            const organizationId = await getOrganizationId(client, latestWebhookData);
            console.log('Organization ID:', organizationId);
            console.log(''); // Blank line

            // Call getThemes function and store themeId
            const themeId = await getThemes(client, latestWebhookData);
            console.log('Theme ID:', themeId);
            console.log(''); // Blank line
            
            // call getLocation function and store locationId
            const locationId = await getLocations(client, latestWebhookData);
            console.log('Location ID:', locationId);
            console.log(''); // Blank line
            
             // call getPrograms function and store programId
            const programId = await getPrograms(client, latestWebhookData);
            console.log('Program ID:', programId);
            console.log(''); // Blank line

            // call Contacts function and store contactId, by passing schoolId and organizationId returned by above function
            const contactId = await Contacts(client, latestWebhookData, schoolId, organizationId);
            console.log('Contact ID:', contactId);
            console.log(''); // Blank line

            // call Booking function and store bookingId, by passing invoiceId, contactId, total classes from above funtion
            const bookingId = await Booking(client, latestWebhookData, invoiceId, contactId, totalClasses);
            console.log('Booking ID:', bookingId);
            console.log(''); // Blank line

             //call ProfClasses and store classId, by passing bookingId, themeId, locationId retruned from above functions   
            const classId = await ProfClasses(client, latestWebhookData, bookingId, programId, themeId, locationId);
            console.log('Class ID:', classId);
            console.log(''); // Blank line

            // Call ProfessionalLearningClasses and store professionalClassId, by paassing classId, organizationId from above function
            const professionalClassId = await ProfessionalLearningClasses(client, latestWebhookData, classId, organizationId);
            console.log('professional ID:', professionalClassId);
            console.log(''); // Blank line
        }
            // Commit the transaction if everything went well
            await client.query('COMMIT');
        } catch (error) {
            console.error('Error during transaction:', error);
            await client.query('ROLLBACK'); // Roll back in case of any error
        } finally {
            client.release(); // Release the client back to the pool
        }
        processedEventIds.clear();
        return res.status(200).send('OK');
    } 
    
    //IF no professional learning experience is detected, its youth experience so execute following functions
    else if(hasYE) {
        console.log('youth experience detected')

        // Establish connection to database
        const client = await pool.connect();
        try {
            // start the database connection
            await client.query('BEGIN');

            // IF orderStatus < 200, it means the order has not been accepted from Xola admin console
            if(Number(latestWebhookData.orderStatus) < 200) {
                console.log('No insertion or update because of status code < 200');
                processedEventIds.clear();
                return res.status(200).send('OK');
            }
            
            // IF orderStatus === 700 , it means the status of order is canceled
            if(latestWebhookData.orderStatus === 700){
                console.log('cancel order status detected')
            }

            // IF status of order is not canceled and been accepted execute followin query
            if (
                (latestWebhookData.eventName === 'order.update' || latestWebhookData.eventName === 'order.cancel') &&
                ((latestWebhookData.orderStatus >= 200 && latestWebhookData.orderStatus <= 300) || latestWebhookData.orderStatus === 700)
            ) {
                // Code to execute 
                // Initialize organizationId as null (This is Youth Experience Programs)
            let organizationId = null;

            //Logic to get total number of classes
            const totalClasses = Array.isArray(latestWebhookData.Quantity) ? latestWebhookData.Quantity.reduce((acc, val) => acc + val, 0) : 0;
            console.log('Number of classes in youth learning: ' + totalClasses )
            console.log(''); // Blank line
                
            // Call Invoice Function and store invoiceId
            const invoiceId = await Invoice(client, latestWebhookData);
            console.log('invoice ID:', invoiceId); 
            console.log(''); // Blank line

            // Call getSchoolId function and store schoolId
            const schoolId = await getSchoolId(client, latestWebhookData);
            console.log('School ID:', schoolId);
            console.log(''); // Blank line

            // Call getTehemes function and store themeId
            const themeId = await getThemes(client, latestWebhookData);
            console.log('Theme ID:', themeId);
            console.log(''); // Blank line

            // Call getLocations function and store locationiId
            const locationId = await getLocations(client, latestWebhookData);
            console.log('Location ID:', locationId);
            console.log(''); // Blank line

            // Call getPrograms function and store programId
            const programId = await getPrograms(client, latestWebhookData);
            console.log('Program ID:', programId);
            console.log(''); // Blank line

            // Call Contacts function and store contactId by passing schoolId returned from above function
            const contactId = await Contacts(client, latestWebhookData, schoolId, organizationId);
            console.log('Contact ID:', contactId);
            console.log(''); // Blank line

            // Call Booking function and store bookingid and store bookingId by passing invoiceId, contactId and totalClasses
            const bookingId = await Booking(client, latestWebhookData, invoiceId, contactId, totalClasses);
            console.log('Booking ID:', bookingId);
            console.log(''); // Blank line

            // Call classes function and store classId
            const classId = await Classes(client, latestWebhookData, bookingId, programId, themeId, locationId);
            console.log('Class ID:', classId);
            console.log(''); // Blank line

            //Call YouthExperienceClasses and store youthClassId
            const youthClassId = await YouthExperienceClasses(client, latestWebhookData, classId, schoolId);
            console.log('Youth Class ID:', youthClassId);      
            console.log(''); // Blank line   
            }
            await client.query('COMMIT');
        } catch (error) {
            console.error('Error during transaction:', error);
            await client.query('ROLLBACK'); // Roll back in case of any error
        } finally {
            client.release(); // Release the client back to the pool
        }
    
        //Clear the temporarily saved ids
        processedEventIds.clear();
        // send received confimation to xola
        return res.status(200).send('OK');
    }

    else{
        console.log("None of YE or PL is detected");
         //Clear the temporarily saved ids
         processedEventIds.clear();
         // send received confimation to xola
         return res.status(200).send('OK');
    }
    });

    // function for Dynamic Population of specifiedValues
const getSpecifiedValues = async (client) => {
  try {
    const query = `
      SELECT Name
      FROM saltcorn.programs
      WHERE LOWER(Category) = 'professional learning'
    `;
    const result = await client.query(query);
    return result.rows.map(row => row.name.toLowerCase());
  } catch (error) {
    console.error('Error querying specified values:', error);
    throw error;
  }
};

// function for Dynamic Population of youthexperiencesProgram
const getYouthExperiences = async (client) => {
    try {
      const query = `
        SELECT Name
        FROM saltcorn.programs
        WHERE LOWER(Category) = 'youth experience'
      `;
      const result = await client.query(query);
      return result.rows.map(row => row.name.toLowerCase());
    } catch (error) {
      console.error('Error querying specified values:', error);
      throw error;
    }
  };


  /** Helper function to populate data in database begins here */

// Invoice table
const Invoice = async (client, data) => {
    let invoiceId = null; // Initialize invoiceId as null
    
    try {
            // Check if the event name is 'order.cancel' and update isActive if true
            if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
                const cancelInvoiceQuery = `
                    UPDATE saltcorn.invoices
                    SET isActive = false 
                    WHERE XolaBookingID = $1
                    RETURNING ID
                `;
    
                const cancelResult = await client.query(cancelInvoiceQuery, [data.id]);
    
                // check how many rows are returned
                if (cancelResult.rows.length > 0) {
                    // select the first row and get its id and return that id
                    invoiceId = cancelResult.rows[0].id;
                    console.log(`Invoice canceled with ID: ${invoiceId}`);
                    return invoiceId;
                } else {
                    console.log(`No invoice found with XolaBookingID: ${data.id} to cancel.`);
                    return null;
                }
            }

        // If the webhook is order.update
        if (data.eventName === 'order.update')  {  
    
      // Step 1: Check if the invoice already exists using XolaBookingID
      const checkInvoiceQuery = `
        SELECT ID FROM saltcorn.invoices
        WHERE XolaBookingID = $1
      `;
      const invoiceResult = await client.query(checkInvoiceQuery, [data.id]);
  
      // If the invoice exists, return the existing ID
      if (invoiceResult.rows.length > 0) {
        invoiceId = invoiceResult.rows[0].id;
        console.log(`Invoice found with ID: ${invoiceId}`);
        return invoiceId;
      } else {
        // Step 2: If the invoice doesn't exist, insert a new row and return the new ID
        const insertQuery = `
          INSERT INTO saltcorn.invoices (
            XolaBookingID, InvoiceNumber, Amount, InvoiceDate, paymentType, PaymentMethod, Notes, isPaid, isActive
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING ID
        `;
        
        const result = await client.query(insertQuery, [
          data.id,              // XolaBookingID
          null,                 // InvoiceNumber (default to null)
          data.amount,          // Amount for the invoice
          null,                 // InvoiceDate
          null,                 // PaymentType
          data.paymentMethod,   // PaymentMethod
          data.notes[0],   // Notes (default to null if not provided)
          false,                // isPaid (default to false)
          true                 // isactive (default to false)
        ]);
  
        // Check if the insertion returned a new ID
        if (result.rows.length > 0) {
          invoiceId = result.rows[0].id;
          console.log(`New invoice inserted with ID: ${invoiceId}`);
        } else {
          console.error('Failed to insert new invoice: No ID returned.');
        }
      }
    }
    } catch (error) {
      console.error('Error processing invoice:', error);
    }
    return invoiceId; // Return the invoice ID (either existing or newly created)
  };
  
 
//Function that checks if the organization already exists in database
// IF yes return existing id, else insert new row and return id
const getOrganizationId = async (client, data) => {
    let organizationId = null;
    try {
        // Check if data.Questions1 and data.Questions1[0] are defined to prevent TypeError
        const organizationName = data.Questions1 && data.Questions1[0]
            ? data.Questions1[0].trim(): null;

        // If organizationName is null or empty, log an error and return null
        if (!organizationName) {
            console.error("Error: organization name is missing or undefined.");
            return organizationId;
        }

        if (data.eventName === 'order.update') {
            // If the event is 'order.update', look for the organization by name
            console.log("Calling getOrganizationID with name:", organizationName);
            
            const organizationQuery = `
                SELECT id FROM saltcorn.organizations WHERE LOWER(name) = $1;
            `;
  
            const result = await client.query(organizationQuery, [organizationName.toLowerCase()]);
  
            if (result.rows.length > 0) {
                // If the organization exists, return the existing organizationId
                organizationId = result.rows[0].id;
                console.log(`Organization found. Returning existing organizationId: ${organizationId}`);
            } else {
                // If the organization does not exist, insert a new organization and return the new organizationId
                const insertQuery = `
                    INSERT INTO saltcorn.organizations (name, isActive)
                    VALUES ($1, $2)
                    RETURNING id;
                `;

                const insertResult = await client.query(insertQuery, [
                    organizationName, // organization name
                    true             // isActive
                ]);
                
                organizationId = insertResult.rows[0].id;
                console.log(`Organization not found. New organization created with ID: ${organizationId}`);
            }
        }
    } catch (error) {
        console.error("Error processing organization:", error);
    }
    return organizationId; // Return the organizationId (either existing or newly created)
};


//Function that checks if the School already exists in database
// IF yes return existing id, else insert new row and return id
const getSchoolId = async (client, data) => {
    let schoolId = null; // Initialize schoolId as null
    
    try {
      if (data.eventName !== 'order.update') {
        // If the event is 'order.create', return null as no school is associated yet
        console.log("Event is 'order.create'; returning null for schoolId.");
        return schoolId;  // Return null
      }
    
      if (data.eventName === 'order.update') {
        // Prepare the school name by trimming whitespace and converting to lowercase
        const schoolName = data.Questions1[1].trim();
        const schoolBoardName = data.Questions1[0].trim().toLowerCase(); // School board name
          
        // Step 1: Look up the schoolBoardId by the school board name
        const checkSchoolBoardQuery = `
          SELECT id FROM saltcorn.school_boards
          WHERE LOWER(name) = $1
        `;
        const schoolBoardResult = await client.query(checkSchoolBoardQuery, [schoolBoardName]);
  
        // If the school board doesn't exist, return null or handle the error
        if (schoolBoardResult.rows.length === 0) {
          console.error(`School board '${schoolBoardName}' not found.`);
          return null;
        }
  
        const schoolBoardId = schoolBoardResult.rows[0].id; // Extract the schoolBoardId
        console.log(`School board found with ID: ${schoolBoardId}`);
  
        // Step 2: Now, check if the school already exists using the schoolBoardId and school name
        const checkSchoolQuery = `
          SELECT ID FROM saltcorn.Schools 
          WHERE LOWER(Name) = $1 AND SchoolBoardId = $2
        `;
    
        const result = await client.query(checkSchoolQuery, [schoolName.toLowerCase(), schoolBoardId]);
    
        // If the school exists, return the existing ID
        if (result.rows.length > 0) {
          schoolId = result.rows[0].id;
          console.log(`School found with ID: ${schoolId}`);
          return schoolId;
        } else {
          // Step 3: If the school doesn't exist, insert the new school and return the new ID
          const insertSchoolQuery = `
            INSERT INTO saltcorn.Schools (Name, SchoolBoardId, Grades) 
            VALUES ($1, $2, $3) 
            RETURNING ID
          `;
          
          const insertResult = await client.query(insertSchoolQuery, [
            schoolName,         // School name
            schoolBoardId,      // School board ID
            data.Questions1[2]  // Grades
          ]);
    
          schoolId = insertResult.rows[0].id;
          console.log(`New school created with ID: ${schoolId}`);
          return schoolId;
        }
      }
    } catch (error) {
      console.error("Error processing school:", error);
    }
    
    return schoolId; // Return the schoolId (either existing or newly created)
  };

//Function that checks if the Contact that booked in xola already exists in contacts table in database
// IF yes return existing id, else insert new row and return id
  const Contacts = async (client, data, schoolId, organizationId) => {
    let contactId = null;

    const trimmedName = data.customerName.trim();

    // Split the name into first and last name based on the space
    const nameParts = trimmedName.split(' ');

    // Extract first and last name
    const firstName = nameParts[0] || ''; // If the first name exists, use it, otherwise default to an empty string
    const lastName = nameParts.slice(1).join(' ') || ''; // The rest of the name after the first space, join back in case of middle names


    try {
        // Handle 'order.cancel' event
        if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
            const deactivateContactQuery = `
                UPDATE saltcorn.Contacts
                SET isActive = false
                WHERE XolaBookingID = $1
                RETURNING ID
            `;
    
            const deactivateResult = await client.query(deactivateContactQuery, [data.id]);
    
            if (deactivateResult.rows.length > 0) {
                contactId = deactivateResult.rows[0].id;
                console.log(`Contact deactivated with ID: ${contactId}`);
                return contactId;
            } else {
                console.log(`No contact found with XolaBookingID: ${data.id} to deactivate.`);
                return null;
            }
        }

        // Handle 'order.update' event
        if (data.eventName === 'order.update') {
            let checkContactQuery = '';
            let queryParams = [trimmedName.toLowerCase()];

            // Step 1: Determine which ID (schoolId or organizationId) is provided
            if (schoolId && !organizationId) {
                // If schoolId is provided and organizationId is null
                checkContactQuery = `
                    SELECT ID FROM saltcorn.Contacts
                    WHERE LOWER(fullName) = $1 
                    AND schoolId = $2
                `;
                queryParams.push(schoolId);
            } else if (organizationId && !schoolId) {
                // If organizationId is provided and schoolId is null
                checkContactQuery = `
                    SELECT ID FROM saltcorn.Contacts
                    WHERE LOWER(fullName) = $1 
                    AND organizationId = $2
                `;
                queryParams.push(organizationId);
            } else {
                // If both schoolId and organizationId are provided, or neither is provided
                console.log("Error: Both schoolId and organizationId cannot be provided together or both cannot be null.");
                return null;
            }

            // Step 2: Check if the contact exists based on the available ID
            const contactResult = await client.query(checkContactQuery, queryParams);

            if (contactResult.rows.length > 0) {
                contactId = contactResult.rows[0].id;
                console.log(`Contact found with ID: ${contactId}`);
                return contactId;
            } else {
                console.log(trimmedName);
                // Step 3: If the contact doesn't exist, insert a new row and return the new ID
                const insertContactQuery = `
                    INSERT INTO saltcorn.Contacts 
                    (XolaBookingID, fullName, Email, phone, isTeacher, isActive, schoolId, organizationId, firstName, lastName)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING ID
                `;
                
                const insertResult = await client.query(insertContactQuery, [
                    data.id,    //xolabooking iid
                    trimmedName || null,    //filtered name
                    data.customerEmail,     // customer email
                    data.phone, //customer phone
                    true,         // isTeacher
                    true,         // isActive
                    schoolId ||null,     // schoolId (can be null)
                    organizationId || null, // organizationId (can be null)
                    firstName,
                    lastName
                ]);
                
                contactId = insertResult.rows[0].id;
                console.log(`New contact created with ID: ${contactId}`);
                return contactId;
            }
        }
    } catch (error) {
        console.error("Error processing contact:", error);
    }
    return contactId;
};


//Function that checks if the booking already exists in bookings table in database with xolabookingID
// IF yes return existing id, else insert new row and return id
const Booking = async (client, data, invoiceId, contactId, classNum ) => {
    let bookingId = null;  // Initialize bookingId as null
  
    try {

        console.log("Booking function is being called with contact ID: " + contactId)


        // Check if the event name is 'order.cancel' and update isDeleted if true
        if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
                const cancelBookingQuery = `
                    UPDATE saltcorn.Bookings
                    SET 
                        isActive = false,
                        bookingStatus = 'Canceled'
                    WHERE XolaBookingID = $1
                    RETURNING ID
                `;

            const cancelResult = await client.query(cancelBookingQuery, [data.id]);

            if (cancelResult.rows.length > 0) {
                bookingId = cancelResult.rows[0].id;
                console.log(`Booking canceled with ID: ${bookingId}`);
                return bookingId;
            } else {
                console.log(`No booking found with XolaBookingID: ${data.id} to cancel.`);
                return null;
            }
        }

        if (data.eventName === 'order.update'){
      // Step 1: Check if the booking already exists using XolaBookingID
      const checkBookingQuery = `
        SELECT ID FROM saltcorn.Bookings
        WHERE XolaBookingID = $1
      `;
      const bookingResult = await client.query(checkBookingQuery, [data.id]);
  
      // If the booking exists, return the existing ID
      if (bookingResult.rows.length > 0) {
        bookingId = bookingResult.rows[0].id;
        console.log(`Booking found with ID: ${bookingId}`);
        return bookingId;
      } else {
        // Step 2: If the booking doesn't exist, insert a new row and return the new ID
        const insertBookingQuery = `
          INSERT INTO saltcorn.Bookings (
            XolaBookingID, InvoiceID, ContactID, NumberofClasses, isActive, Notes)
          VALUES ($1, $2, $3, $4, $5, $6) 
          RETURNING ID
        `;
        
        const insertResult = await client.query(insertBookingQuery, [
          data.id,         // XolaBookingID
          invoiceId,      // InvoiceID (nullable)
          contactId,      // ContactID (nullable)
          classNum,        // Number of Classes
          true,         //isactive
          data.notes[0] //notes
        ]);
        
        bookingId = insertResult.rows[0].id;
        console.log(`New booking created with ID: ${bookingId}`);
        return bookingId;
      }
    }
    } catch (error) {
      console.error("Error processing booking:", error);
    }

    return bookingId;  // Return the bookingId (either existing or newly created)
  };
  
  //Function that checks if the themes already exists in themes table in database
// IF yes return existing id, else insert new row and return id
const getThemes = async (client, data) => {
    const themeIds = []; // Array to store all theme IDs

    try {
        for (let i = 0; i < data.ExperiencesID.length; i++) {
            console.log('Theme before trim is: '+ data.addons1[i]);

            // extract just the theme name from name with filter
            const themeName = data.addons1[i]
    ? data.addons1[i]
        .split(':')[1]?.trim()  // Get the part after ':'
        .split('(')[0]?.trim()  // Get the part before '('
        .split('-')[0]?.trim()  // Get the part before '-'
    : null;

console.log(`Theme name extracted: ${themeName}`);


            if (!themeName) {
                console.log(`Theme name missing or invalid for ExperienceID at index ${i}. Skipping this entry.`);
                continue; // Skip this iteration if themeName is null or invalid
            }

            // Step 1: Check if the theme already exists using the theme name
            const checkThemeQuery = `
                SELECT ID FROM saltcorn.Themes
                WHERE LOWER(Name) = $1
            `;
            
            const themeResult = await client.query(checkThemeQuery, [themeName.toLowerCase()]);

            // If the theme exists, retrieve the existing ID
            let themeId;
            if (themeResult.rows.length > 0) {
                themeId = themeResult.rows[0].id;
                console.log(`Theme found with ID: ${themeId}`);
            } else {
                // Step 2: If the theme doesn't exist, insert a new row and retrieve the new ID
                const insertThemeQuery = `
                    INSERT INTO saltcorn.Themes (Name, isActive)
                    VALUES ($1, $2)
                    RETURNING ID
                `;

                const insertResult = await client.query(insertThemeQuery, [themeName, true]);
                themeId = insertResult.rows[0].id;
                console.log(`New theme created with ID: ${themeId}`);
            }

            // Add the theme ID to the themeIds array
            themeIds.push(themeId);
        }
    } catch (error) {
        console.error("Error processing theme:", error);
    }

    return themeIds;  // Return array of theme IDs
};


//Function that checks if the location already exists in database
// IF yes return existing id, else insert new row and return id
const getLocations = async (client, data) => {
    const locationIds = []; // Array to store all location IDs
  
    try {
      for (let i = 0; i < data.ExperiencesID.length; i++) {
        // Log the raw addon for debugging
        const rawAddon = data.addons2[i];
        console.log(`Raw addon at index ${i}:`, rawAddon);
  
        // Extract location name using safe processing
        const locationName = rawAddon
          ? rawAddon.split('(')[0]?.split(':')[1]?.split('-')[0]?.trim() || null
          : null;
  
        // Log the processed location name for debugging
        console.log(`Processed locationName at index ${i}:`, locationName);
  
        // Check if location name is invalid or empty
        if (!locationName || locationName.trim() === "") {
          console.log(`Invalid or empty locationName at index ${i}. Skipping.`);
          locationIds.push(null); // Push null for invalid entries
          continue;
        }
  
        // Check if 'themes' is present in the location name
        if (rawAddon.toLowerCase().includes('themes')) {
          console.log(`Skipping due to themes keyword: ${locationName}`);
          locationIds.push(null); // Push null for themes-related entries
          continue;
        }
  
        // Step 1: Check if the location already exists using the location name
        const checkLocationQuery = `
            SELECT ID FROM saltcorn.Locations
            WHERE LOWER(Name) = $1
        `;
        
        const locationResult = await client.query(checkLocationQuery, [locationName.toLowerCase()]);
        
        // If the location exists, retrieve its ID
        let locationId;
        if (locationResult.rows.length > 0) {
          locationId = locationResult.rows[0].id;
          console.log(`Location found with ID: ${locationId}`);
        } else {
          // Step 2: If the location doesn't exist, insert a new row and retrieve its ID
          const insertLocationQuery = `
              INSERT INTO saltcorn.Locations (Name, isActive)
              VALUES ($1, $2)
              RETURNING ID
          `;
  
          const insertResult = await client.query(insertLocationQuery, [locationName, true]);
          locationId = insertResult.rows[0].id;
          console.log(`New location created with ID: ${locationId}`);
        }
  
        // Add the location ID to the locationIds array
        locationIds.push(locationId);
      }
    } catch (error) {
      console.error("Error processing locations:", error);
    }
  
    return locationIds; // Return the array of location IDs
  };
  

//Function that checks if the program already exists in database
// IF yes return existing id, else insert new row and return id
const getPrograms = async (client, data) => {
  const programIds = []; // Array to store all program IDs

  try {
      for (let i = 0; i < data.ExperiencesID.length; i++) {
          const programName = data.Experiences[i] ? data.Experiences[i].trim() : null;

          if (!programName) {
              console.log(`Program name missing or invalid for ExperienceID at index ${i}. Skipping this entry.`);
              continue; // Skip this iteration if programName is null or invalid
          }

          // Step 1: Check if the program already exists using the program name
          const checkProgramQuery = `
              SELECT ID FROM saltcorn.Programs
              WHERE LOWER(Name) = $1
          `;
          
          const programResult = await client.query(checkProgramQuery, [programName.toLowerCase()]);

          // If the program exists, retrieve the existing ID
          let programId;
          if (programResult.rows.length > 0) {
              programId = programResult.rows[0].id;
              console.log(`Program found with ID: ${programId}`);
          } else {
              // Step 2: If the program doesn't exist, insert a new row and retrieve the new ID
              const insertProgramQuery = `
                  INSERT INTO saltcorn.Programs (Name)
                  VALUES ($1)
                  RETURNING ID
              `;

              const insertResult = await client.query(insertProgramQuery, [programName]);
              programId = insertResult.rows[0].id;
              console.log(`New program created with ID: ${programId}`);
          }

          // Add the program ID to the programIds array
          programIds.push(programId);
      }
  } catch (error) {
      console.error("Error processing program:", error);
  }
  return programIds;  // Return array of program IDs
};

//Function that checks if the classes with booking id from above already exists in classes table in database
// IF yes return existing id, else insert new row and return id
const Classes = async (client, data, bookingId, programIds, themeIds, locationIds) => {
    const classIds = []; // Array to store created or updated class IDs
  
    try {
      if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
        // Handle 'order.cancel' event by deactivating classes
        const deactivateQuery = `
            UPDATE saltcorn.experiences
            SET isActive = false
            WHERE BookingID = $1
            RETURNING ID
        `;
        const deactivateResult = await client.query(deactivateQuery, [bookingId]);
  
        if (deactivateResult.rows.length > 0) {
          console.log(`Deactivated ${deactivateResult.rows.length} class(es) with BookingID: ${bookingId}`);
          deactivateResult.rows.forEach(row => classIds.push(row.id));
        } else {
          console.log(`No classes found with BookingID: ${bookingId} to deactivate.`);
        }
        return classIds; // Return IDs of deactivated classes
      }
  
      // Always handle 'order.update' events
      const selectClassesQuery = `
          SELECT ID FROM saltcorn.experiences
          WHERE BookingID = $1
      `;
      const selectResult = await client.query(selectClassesQuery, [bookingId]);
  
      if (selectResult.rows.length > 0) {
        // If classes are found, update their ThemeID and LocationID
        console.log(`Found ${selectResult.rows.length} class(es) with BookingID: ${bookingId}`);
        
        let index = 0; // Initialize index to track themeIds and locationIds
        let classindex = 0; // Tracks the number of classes for each ExperienceID
        
        // Sort the selectResult rows by class ID in ascending order
        const sortedClasses = selectResult.rows.sort((a, b) => a.id - b.id);
  
        for (let i = 0; i < data.ExperiencesID.length; i++) {
          const quantity = data.Quantity[i]; // Get the quantity for the current ExperienceID

          for (let j = 0; j < quantity; j++) {
            if (classindex < sortedClasses.length) {
              const row = sortedClasses[classindex]; // Get the corresponding class for update
              
              const updateClassQuery = `
                UPDATE saltcorn.experiences
                SET ThemeID = $1, LocationID = $2, Date = $3
                WHERE ID = $4
                RETURNING ID
              `;
  
              // Update the class with the current themeId and locationId
              const updateResult = await client.query(updateClassQuery, [
                themeIds[index], // ThemeID based on index
                locationIds[index], // LocationID based on index
                `${data.arrivalDate[i]}T09:00:00`,
                row.id // Class ID to update
              ]);

              if (updateResult.rows.length > 0) {
                const updatedId = updateResult.rows[0].id;
                if (!classIds.includes(updatedId)) {
                  classIds.push(updatedId); // Push the updated class ID
                }
                console.log(`Updated class ID: ${updatedId} with new ThemeID and LocationID`);
              } else {
                console.error(`Failed to update class ID: ${row.id}`);
              }

              classindex++; // Move to the next class
            }
          }

          // After updating all classes for the current ExperienceID, increment the index for the next ThemeID and LocationID
          index++;
        }
      } else {
        // If no classes are found, proceed with insertion logic
        console.log(`No classes found with BookingID: ${bookingId}. Creating new classes.`);
  
        for (let i = 0; i < data.ExperiencesID.length; i++) {
          for (let j = 0; j < data.Quantity[i]; j++) {
            const insertClassQuery = `
                INSERT INTO saltcorn.experiences (
                    BookingID, ProgramID, ThemeID, LocationID, Date, isYouthExperience, isProfessionalLearning, Notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING ID
            `;
  
            const insertResult = await client.query(insertClassQuery, [
              bookingId,
              programIds[i],
              themeIds[i],
              locationIds[i],
              `${data.arrivalDate[i]}T09:00:00`,
              true,
              false,
              data.notes[0]
            ]);
  
            if (insertResult.rows.length > 0) {
              const classId = insertResult.rows[0].id;
              classIds.push(classId);
              console.log(`New class created with ID: ${classId}`);
            } else {
              console.error('Failed to insert new class: No ID returned.');
            }
          }
        }
      }
      return classIds; // Return the array of created or updated class IDs
    } catch (error) {
      console.error("Error processing class creation or update:", error);
      return null;
    }
};


//Function that checks if the YouthExperienceclasses already exists in  youthexperience table in database
// IF yes return existing id, else insert new row and return id
const YouthExperienceClasses = async (client, data, classIds, schoolId) => {
    const youthExperienceClassIds = []; // Array to store created or retrieved YouthExperienceClass IDs
  
    try {

        if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
            const deactivateQuery = `
                UPDATE saltcorn.Youth_Experiences
                SET isActive = false
                WHERE ClassID = ANY($1)
                RETURNING ID
            `;
            const deactivateResult = await client.query(deactivateQuery, [classIds]);

            if (deactivateResult.rows.length > 0) {
                console.log(`Deactivated ${deactivateResult.rows.length} YouthExperienceClass(es) for ClassIDs: ${classIds.join(', ')}`);
                deactivateResult.rows.forEach(row => youthExperienceClassIds.push(row.id));
            } else {
                console.log(`No YouthExperienceClass records found for ClassIDs: ${classIds.join(', ')} to deactivate.`);
            }
            return youthExperienceClassIds; // Return IDs of deactivated classes
        }

        // Get the current year as a date in YYYY format for AcademicYear
        const currentYearDate = `${new Date().getFullYear()}`;
        let classIndex = 0; // Start the classIndex at 0
  
        // Loop over each experience and its quantity
        for (let i = 0; i < data.ExperiencesID.length; i++) {
            const questions = i === 0 ? data.Questions1 : i === 1 ? data.Questions2 : data.Questions3;
  
            // Check if questions and Quantity are defined
            if (!questions || !Array.isArray(questions) || data.Quantity[i] === undefined) {
                console.log(`Questions or quantity for experience at index ${i} is missing or undefined. Skipping.`);
                continue;
            }

            // user enter grades and studentNum sepraed by comma, so split it  with comma
            const gradesArray = questions[2] ? questions[2].split(',') : [];
            const studentNum = questions[4] ? questions[4].split(',') : [];
            const quantity = data.Quantity[i] || 0;
  
            for (let j = 0; j < quantity; j++) {
                console.log('classIndex: ' + classIndex);
                if (classIndex >= classIds.length) {
                    console.error(`classIds is out of bounds for experience index ${i}. Skipping.`);
                    continue;
                }
  
                // Check if a YouthExperienceClass record already exists for this ClassID
                const selectQuery = `
                    SELECT ID FROM saltcorn.Youth_Experiences
                    WHERE ClassID = $1
                `;
  
                const selectResult = await client.query(selectQuery, [classIds[classIndex]]);
  
                // If the record exists, update it
                if (selectResult.rows.length > 0) {
                    const youthClassId = selectResult.rows[0].id;
                    const updateQuery = `
                        UPDATE saltcorn.Youth_Experiences
                        SET 
                            SchoolID = $1,
                            NumberofStudents = $2
                        WHERE ID = $3
                        RETURNING ID
                    `;
  
                    const updateResult = await client.query(updateQuery, [
                        schoolId,   //schoolid
                        studentNum[j], //student number
                        youthClassId
                    ]);
  
                    if (updateResult.rows.length > 0) {
                        console.log(`YouthExperienceClass updated with ID: ${youthClassId}`);
                        youthExperienceClassIds.push(youthClassId);
                    } else {
                        console.error(`Failed to update YouthExperienceClass with ID: ${youthClassId}`);
                    }
                } 
                // If no record exists, insert a new one
                else {
                    const insertYouthClassQuery = `
                        INSERT INTO saltcorn.Youth_Experiences (
                            ClassID, SchoolID, NumberofStudents, AcademicYear, EnvironmentalAction, OtherDetails, isActive
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING ID
                    `;
  
                    const insertResult = await client.query(insertYouthClassQuery, [
                        classIds[classIndex],
                        schoolId,
                        studentNum[j],
                        currentYearDate,
                        false,
                        `Schedule list:${questions[5]}|| Teacher list: ${questions[3]} || Grades: ${questions[2] || null}` || null,
                        true
                    ]);
  
                    if (insertResult.rows.length > 0) {
                        const youthExperienceClassId = insertResult.rows[0].id;
                        youthExperienceClassIds.push(youthExperienceClassId);
                        console.log(`New YouthExperienceClass created with ID: ${youthExperienceClassId}`);
                    } else {
                        console.error('Failed to insert new YouthExperienceClass: No ID returned.');
                    }
                }
                classIndex++; // Increment the classIndex
            }
        }
        return youthExperienceClassIds; // Return the array of created or updated class IDs
    } catch (error) {
        console.error("Error processing YouthExperienceClass creation/update:", error);
        return null;
    }
  };
  

//Function that checks if the professional learning classes already exists in professionallearningclasses table in database
// IF yes return existing id, else insert new row and return id
const ProfessionalLearningClasses = async (client, data, classIds, organizationId) => {
    const professionalLearningClassIds = []; // Array to store created or updated ProfessionalLearningClass IDs
  
    try {
        if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
            // Handle 'order.cancel' event by deactivating ProfessionalLearningClasses
            const deactivateQuery = `
                UPDATE saltcorn.professional_learning_experiences
                SET isActive = false
                WHERE ClassID = ANY($1)
                RETURNING ID
            `;
            const deactivateResult = await client.query(deactivateQuery, [classIds]);

            if (deactivateResult.rows.length > 0) {
                console.log(`Deactivated ${deactivateResult.rows.length} ProfessionalLearningClass(es) for ClassIDs: ${classIds.join(', ')}`);
                // Gather the IDs of deactivated ProfessionalLearningClasses
                for (const row of deactivateResult.rows) {
                    professionalLearningClassIds.push(row.id);
                }
            } else {
                console.log(`No ProfessionalLearningClass records found for ClassIDs: ${classIds.join(', ')} to deactivate.`);
            }

            return professionalLearningClassIds; // Return the IDs of deactivated ProfessionalLearningClasses
        }


        // Handle 'order.update' event
        // For each classId, check for existing ProfessionalLearningClass records and update them
        for (let i = 0; i < classIds.length; i++) {
            const questions = i === 0 ? data.Questions1 : i === 1 ? data.Questions2 : data.Questions3;
            const selectQuery = `
                SELECT ID FROM saltcorn.professional_learning_experiences
                WHERE ClassID = $1
            `;
  
            const selectResult = await client.query(selectQuery, [classIds[i]]);
            const existingProfessionalClassIds = selectResult.rows.map(row => row.id); // Extract existing IDs
  
            // If records exist, update them
            if (existingProfessionalClassIds.length > 0) {
                for (const professionalClassId of existingProfessionalClassIds) {
                    const updateQuery = `
                        UPDATE saltcorn.professional_learning_experiences
                        SET 
                            OrganizationID = $1
                        WHERE ID = $2
                        RETURNING ID
                    `;
  
                    const updateResult = await client.query(updateQuery, [
                        organizationId,                             // OrganizationID
                        professionalClassId                         // Target record ID for update
                    ]);
                    if (updateResult.rows.length > 0) {
                        console.log(`ProfessionalLearningClass updated with ID: ${professionalClassId}`);
                        professionalLearningClassIds.push(professionalClassId); // Store updated ID
                    } else {
                        console.error(`Failed to update ProfessionalLearningClass with ID: ${professionalClassId}`);
                    }
                }
            } else {
                console.log(`No existing ProfessionalLearningClass records found for ClassID: ${classIds[i]}. Creating new record.`);
                // If no record exists, create a new ProfessionalLearningClass entry
                const quantity = data.Quantity[i] || 0;
                if (quantity > 0) {
                    // Prepare the insert query for saltcorn.ProfessionalLearningClasses table
                    const insertProfessionalLearningClassQuery = `
                        INSERT INTO saltcorn.professional_learning_experiences (
                            ClassID, OrganizationID, NumberofParticipants, MeetingTime, MeetingLocation, SpecialNeeds, OtherDetails
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING ID
                    `;
  
                    const insertResult = await client.query(insertProfessionalLearningClassQuery, [
                        classIds[i],                          // ClassID from classes array
                        organizationId,                       // OrganizationID
                        quantity,                               // NumberofParticipants
                        questions[1],       //meeting time
                        questions[4] || null, // location
                        questions[3], // special needs
                        questions[2] // other details
                    ]);
  
                    // If insert was successful, store the ProfessionalLearningClass ID
                    if (insertResult.rows.length > 0) {
                        const professionalLearningClassId = insertResult.rows[0].id;
                        professionalLearningClassIds.push(professionalLearningClassId);
                        console.log(`New ProfessionalLearningClass created with ID: ${professionalLearningClassId}`);
                    } else {
                        console.error('Failed to insert new ProfessionalLearningClass: No ID returned.');
                    }
                } else {
                    console.error(`Invalid or missing quantity for experience at index ${i}. Skipping creation.`);
                }
            }
        }
        return professionalLearningClassIds; // Return array of new or updated ProfessionalLearningClass IDs
    } catch (error) {
        console.error("Error processing ProfessionalLearningClass creation/update:", error);
        return null;
    }
  };
  
//Function that checks if the classes already exists in  classes table in database
// IF yes return existing id, else insert new row and return id
// This function is same as Classes function, however this one is for professional learning one
// The logic for both experience are slightly diffrent
const ProfClasses = async (client, data, bookingId, programIds, themeIds, locationIds) => {
    const classIds = []; // Array to store created or updated class IDs
    try {

        if (data.eventName === 'order.cancel' || data.orderStatus === 700) {
            // Handle 'order.cancel' event by deactivating classes
            const deactivateClassesQuery = `
                UPDATE saltcorn.experiences
                SET isActive = false
                WHERE BookingID = $1
                RETURNING ID
            `;
            const deactivateResult = await client.query(deactivateClassesQuery, [bookingId]);

            if (deactivateResult.rows.length > 0) {
                console.log(`Deactivated ${deactivateResult.rows.length} professional class(es) with BookingID: ${bookingId}`);
                // Gather the IDs of deactivated classes
                for (const row of deactivateResult.rows) {
                    classIds.push(row.id);
                }
            } else {
                console.log(`No professional classes found with BookingID: ${bookingId} to deactivate.`);
            }

            return classIds; // Return the IDs of deactivated classes
        }

        // Always handle 'order.update' events
        // Lookup all classes with the same BookingID
        const selectClassesQuery = `
            SELECT ID, ThemeID, LocationID, Date FROM saltcorn.experiences
            WHERE BookingID = $1
        `;
        const selectResult = await client.query(selectClassesQuery, [bookingId]);
  
        if (selectResult.rows.length > 0) {
            // If classes are found, update their ThemeID, LocationID, and Date
            console.log(`Found ${selectResult.rows.length} professional class(es) with BookingID: ${bookingId}`);
            
            // Loop over each existing class and update it
            let index = 0;
            for (const row of selectResult.rows) {
                const updateClassQuery = `
                    UPDATE saltcorn.experiences
                    SET ThemeID = $1, LocationID = $2, Date = $3
                    WHERE ID = $4
                    RETURNING ID
                `;
  
                // Update the class with the new ThemeID, LocationID, and Date
                const updateResult = await client.query(updateClassQuery, [
                    themeIds[index],        // New ThemeID
                    locationIds[index],     // New LocationID
                    data.arrivalDate[index],// New Date
                    row.id                  // Class ID to update
                ]);
  
                if (updateResult.rows.length > 0) {
                    const updatedId = updateResult.rows[0].id;
                    classIds.push(updatedId); // Add updated class ID to the array
                    console.log(`Updated professional class ID: ${updatedId} with new ThemeID, LocationID, and Date`);
                } else {
                    console.error(`Failed to update class ID: ${row.id}`);
                }
                index++; // Move to the next index for themeIds, locationIds, and arrivalDate
            }
        } else {
            // If no classes exist, insert new records
            console.log(`No professional classes found with BookingID: ${bookingId}. Creating new records.`);
  
            // Loop over each experience and insert new professional classes
            for (let i = 0; i < data.ExperiencesID.length; i++) {
                // Prepare the insert query for saltcorn.experiences table
                const insertClassQuery = `
                    INSERT INTO saltcorn.experiences (
                        BookingID, ProgramID, ThemeID, LocationID, Date, isYouthExperience, isProfessionalLearning, Notes, isActive
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING ID
                `;
  
                // Use the correct index for programIds, themeIds, and locationIds arrays
                const insertResult = await client.query(insertClassQuery, [
                    bookingId,                 // BookingID 
                    programIds[i],             // ProgramID
                    themeIds[i],               // ThemeID 
                    locationIds[i],            // LocationID 
                    data.arrivalDate[i],       // Date
                    false,                      // isYouthExperience
                    true,                      // isProfessionalLearning (since this is for professional classes)
                    data.notes[i],             // Notes (by index)
                    true
                ]);
  
                // Add the created class ID to the array if it was successfully inserted
                if (insertResult.rows.length > 0) {
                    const classId = insertResult.rows[0].id;
                    classIds.push(classId);
                    console.log(`New professional class created with ID: ${classId}`);
                } else {
                    console.error('Failed to insert new professional class: No ID returned.');
                }
            }
        }
        return classIds; // Return the array of created or updated class IDs
    } catch (error) {
        console.error("Error processing professional class creation or update:", error);
        return null;
    }
};


// Handle GET request to the root URL
app.get('/', (req, res) => {
    res.send('Welcome to the webhook geda!');
});


// Route to display the webhook data JSON
app.get('/latest', (req, res) => {
    res.send(`
        <h1>Latest Webhook Data</h1>
        <pre>${JSON.stringify(webhookJSON, null, 2)}</pre>
        <p><a href="/">Back to Home</a></p>
    `);
});

// Error handling for unhandled routes
app.use((req, res) => {
    console.log(`Unhandled request: ${req.method} ${req.originalUrl}`);
    res.status(404).send('404 Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

});