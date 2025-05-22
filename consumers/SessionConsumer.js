// /**
//  * @module SessionConsumer
//  * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van sessies in Salesforce.
//  */
//
// const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
//
// module.exports = async function StartSessionConsumer(channel, salesforceClient) {
//
//    function capitalize(s) {
//       return String(s[0]).toUpperCase() + String(s).slice(1);
//    }
//
//    const queues = ["create", "update", "delete"];
//
//    for (const action of queues) {
//       await channel.assertQueue(`crm_session_${action}`, {durable: true});
//
//       console.log("Luisteren op queue:", `crm_session_${action}`);
//       await channel.consume(`crm_session_${action}`, async (msg) => {
//          if (!msg) return;
//
//          const content = msg.content.toString();
//          console.log(`📥 [${action}SessionConsumer] Ontvangen`);
//
//          // XML naar JSON conversie
//          let rabbitMQMsg;
//          try {
//             rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
//          } catch (e) {
//             channel.nack(msg, false, false);
//             console.error('❌ Ongeldig XML formaat:', content);
//             return;
//          }
//
//          let SalesforceObjId;
//          rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Session`];
//
//          if (!rabbitMQMsg) {
//             channel.nack(msg, false, false);
//             console.error("❌ Verkeerde root XSD:", rabbitMQMsg);
//             return;
//          }
//
//          if (['update', 'delete'].includes(action)) {
//             // Zoek Salesforce ID via UUID
//             const query = salesforceClient.sObject("Session__c")
//                 .select("Id")
//                 .where({UUID__c: rabbitMQMsg.SessionUUID})
//                 .limit(1);
//
//             let result;
//             try {
//                result = await query.run();
//             } catch (err) {
//                channel.nack(msg, false, false);
//                console.error("❌ Fout bij ophalen Salesforce Sessie ID:", err.message);
//                return;
//             }
//
//             if (!result || result.length === 0) {
//                channel.nack(msg, false, false);
//                console.error("❌ Geen Salesforce Sessie gevonden voor UUID:", rabbitMQMsg.SessionUUID);
//                return;
//             }
//             SalesforceObjId = result[0].Id;
//          }
//
//          let salesForceMsg;
//          switch (action) {
//             case "create":
//                try {
//                   // Zoek gerelateerd event
//                   const eventQuery = salesforceClient.sObject("Event__c")
//                       .select("Id")
//                       .where({UUID__c: rabbitMQMsg.EventUUID})
//                       .limit(1);
//                   const eventResult = await eventQuery.run();
//
//                   salesForceMsg = {
//                      "UUID__c": rabbitMQMsg.SessionUUID,
//                      "Name": rabbitMQMsg.SessionName,
//                      "Description__c": rabbitMQMsg.SessionDescription || "",
//                      "StartDateTime__c": rabbitMQMsg.StartDateTime,
//                      "EndDateTime__c": rabbitMQMsg.EndDateTime,
//                      "Location__c": rabbitMQMsg.SessionLocation,
//                      "Capacity__c": rabbitMQMsg.Capacity || 0,
//                      "SessionType__c": rabbitMQMsg.SessionType,
//                      "Event__c": eventResult[0]?.Id || ""
//                   };
//
//                   // Verwerk gastsprekers
//                   if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker?.[0]?.email) {
//                      const gsQuery = salesforceClient.sObject("Contact")
//                          .select("Id")
//                          .where({Email: rabbitMQMsg.GuestSpeakers.GuestSpeaker[0].email})
//                          .limit(1);
//                      const gsResult = await gsQuery.run();
//                      if (gsResult[0]?.Id) {
//                         salesForceMsg.GuestSpeaker__c = gsResult[0].Id;
//                      }
//                   }
//
//                   // Verwerk gebruikersregistraties
//                   if (rabbitMQMsg.RegisteredUsers?.User) {
//                      const participantIds = await Promise.all(
//                          rabbitMQMsg.RegisteredUsers.User.map(async u => {
//                             const participantQuery = salesforceClient.sObject("Session_Participant__c")
//                                 .select("Id")
//                                 .where({ParticipantEmail__c: u.email})
//                                 .limit(1);
//                             const result = await participantQuery.run();
//                             return result[0]?.Id;
//                          })
//                      );
//                      salesForceMsg.RegisteredUsers__c = participantIds.filter(Boolean).join(';');
//                   }
//
//                   await salesforceClient.sObject("Session__c").create(salesForceMsg);
//                   console.log("✅ Sessie aangemaakt in Salesforce");
//                } catch (err) {
//                   channel.nack(msg, false, false);
//                   console.error("❌ Fout bij aanmaken:", err.message);
//                   return;
//                }
//                break;
//
//             case "update":
//                try {
//                   salesForceMsg = {
//                      ...(rabbitMQMsg.SessionName && {"Name": rabbitMQMsg.SessionName}),
//                      ...(rabbitMQMsg.SessionDescription && {"Description__c": rabbitMQMsg.SessionDescription}),
//                      ...(rabbitMQMsg.StartDateTime && {"StartDateTime__c": rabbitMQMsg.StartDateTime}),
//                      ...(rabbitMQMsg.EndDateTime && {"EndDateTime__c": rabbitMQMsg.EndDateTime}),
//                      ...(rabbitMQMsg.SessionLocation && {"Location__c": rabbitMQMsg.SessionLocation}),
//                      ...(rabbitMQMsg.Capacity && {"Capacity__c": Number(rabbitMQMsg.Capacity)}),
//                      ...(rabbitMQMsg.SessionType && {"SessionType__c": rabbitMQMsg.SessionType}),
//                   };
//
//                   // GuestSpeakers veilig verwerken (ook bij 1 object)
//                   if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker) {
//                      const guestList = Array.isArray(rabbitMQMsg.GuestSpeakers.GuestSpeaker)
//                          ? rabbitMQMsg.GuestSpeakers.GuestSpeaker
//                          : [rabbitMQMsg.GuestSpeakers.GuestSpeaker];
//
//                      const guestIds = await Promise.all(
//                          guestList.map(async guest => {
//                             if (!guest?.email) return null;
//                             const result = await salesforceClient.sObject("Contact")
//                                 .select("Id")
//                                 .where({Email: guest.email})
//                                 .limit(1)
//                                 .run();
//                             return result[0]?.Id;
//                          })
//                      );
//
//                      if (guestIds.length > 0) {
//                         salesForceMsg.GuestSpeaker__c = guestIds.filter(Boolean).join(';');
//                      }
//                   }
//
//                   // RegisteredUsers veilig verwerken (ook bij 1 object)
//                   if (rabbitMQMsg.RegisteredUsers?.User) {
//                      const userList = Array.isArray(rabbitMQMsg.RegisteredUsers.User)
//                          ? rabbitMQMsg.RegisteredUsers.User
//                          : [rabbitMQMsg.RegisteredUsers.User];
//
//                      const userIds = await Promise.all(
//                          userList.map(async u => {
//                             if (!u?.email) return null;
//                             const result = await salesforceClient.sObject("Session_Participant__c")
//                                 .select("Id")
//                                 .where({ParticipantEmail__c: u.email})
//                                 .limit(1)
//                                 .run();
//                             return result[0]?.Id;
//                          })
//                      );
//
//                      if (userIds.length > 0) {
//                         salesForceMsg.RegisteredUsers__c = userIds.filter(Boolean).join(';');
//                      }
//                   }
//
//                   await salesforceClient.sObject("Session__c").update(SalesforceObjId, salesForceMsg);
//                   console.log("✅ Sessie geüpdatet in Salesforce");
//                } catch (err) {
//                   channel.nack(msg, false, false);
//                   console.error("❌ Fout bij update:", err.message);
//                   return;
//                }
//                break;
//
//             case "delete":
//                try {
//                   await salesforceClient.sObject("Session__c").delete(SalesforceObjId);
//                   console.log("✅ Sessie verwijderd uit Salesforce");
//                } catch (err) {
//                   channel.nack(msg, false, false);
//                   console.error("❌ Fout bij delete:", err.message);
//                   return;
//                }
//                break;
//
//             default:
//                channel.nack(msg, false, false);
//                console.error(`❌ Ongeldige queue: ${action}`);
//                return;
//          }
//
//          await channel.ack(msg);
//       });
//
//       console.log(`🔔 Luistert naar berichten op queue "crm_session_${action}"…`);
//    }
// };

/**
 * @module SessionConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van sessies in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

module.exports = async function StartSessionConsumer(channel, salesforceClient) {

   function capitalize(s) {
      return String(s[0]).toUpperCase() + String(s).slice(1);
   }

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_session_${action}`, {durable: true});

      console.log("Luisteren op queue:", `crm_session_${action}`);
      await channel.consume(`crm_session_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         console.log(`📥 [${action}SessionConsumer] Ontvangen`);

         // XML naar JSON conversie
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            console.error('❌ Ongeldig XML formaat:', content);
            return;
         }

         let SalesforceObjId;
         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Session`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            console.error("❌ Verkeerde root XSD:", rabbitMQMsg);
            return;
         }

         if (["update", "delete"].includes(action)) {
            const query = salesforceClient.sObject("Session__c")
                .select("Id")
                .where({UUID__c: rabbitMQMsg.SessionUUID})
                .limit(1);

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               console.error("❌ Fout bij ophalen Salesforce Sessie ID:", err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce Sessie gevonden voor UUID:", rabbitMQMsg.SessionUUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         let salesForceMsg;
         switch (action) {
            case "create":
               try {
                  const eventQuery = salesforceClient.sObject("Event__c")
                      .select("Id")
                      .where({UUID__c: rabbitMQMsg.EventUUID})
                      .limit(1);
                  const eventResult = await eventQuery.run();

                  salesForceMsg = {
                     UUID__c: rabbitMQMsg.SessionUUID,
                     Name: rabbitMQMsg.SessionName,
                     Description__c: rabbitMQMsg.SessionDescription || "",
                     StartDateTime__c: rabbitMQMsg.StartDateTime,
                     EndDateTime__c: rabbitMQMsg.EndDateTime,
                     Location__c: rabbitMQMsg.SessionLocation,
                     Capacity__c: rabbitMQMsg.Capacity || 0,
                     SessionType__c: rabbitMQMsg.SessionType,
                     Event__c: eventResult[0]?.Id || ""
                  };

                  if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker?.[0]?.email) {
                     const gsQuery = salesforceClient.sObject("Contact")
                         .select("Id")
                         .where({Email: rabbitMQMsg.GuestSpeakers.GuestSpeaker[0].email})
                         .limit(1);
                     const gsResult = await gsQuery.run();
                     if (gsResult[0]?.Id) {
                        salesForceMsg.GuestSpeaker__c = gsResult[0].Id;
                     }
                  }

                  if (rabbitMQMsg.RegisteredUsers?.User) {
                     const participantIds = await Promise.all(
                         rabbitMQMsg.RegisteredUsers.User.map(async u => {
                            const participantQuery = salesforceClient.sObject("Session_Participant__c")
                                .select("Id")
                                .where({ParticipantEmail__c: u.email})
                                .limit(1);
                            const result = await participantQuery.run();
                            return result[0]?.Id;
                         })
                     );
                     salesForceMsg.RegisteredUsers__c = participantIds.filter(Boolean).join(';');
                  }

                  await salesforceClient.sObject("Session__c").create(salesForceMsg);
                  console.log("✅ Sessie aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij aanmaken:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  salesForceMsg = {
                     Id: SalesforceObjId,
                     ...(rabbitMQMsg.SessionName && {Name: rabbitMQMsg.SessionName}),
                     ...(rabbitMQMsg.SessionDescription && {Description__c: rabbitMQMsg.SessionDescription}),
                     ...(rabbitMQMsg.StartDateTime && {StartDateTime__c: rabbitMQMsg.StartDateTime}),
                     ...(rabbitMQMsg.EndDateTime && {EndDateTime__c: rabbitMQMsg.EndDateTime}),
                     ...(rabbitMQMsg.SessionLocation && {Location__c: rabbitMQMsg.SessionLocation}),
                     ...(rabbitMQMsg.Capacity && {Capacity__c: Number(rabbitMQMsg.Capacity)}),
                     ...(rabbitMQMsg.SessionType && {SessionType__c: rabbitMQMsg.SessionType})
                  };

                  if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker) {
                     const guestList = Array.isArray(rabbitMQMsg.GuestSpeakers.GuestSpeaker)
                         ? rabbitMQMsg.GuestSpeakers.GuestSpeaker
                         : [rabbitMQMsg.GuestSpeakers.GuestSpeaker];

                     const guestIds = await Promise.all(
                         guestList.map(async guest => {
                            if (!guest?.email) return null;
                            const result = await salesforceClient.sObject("Contact")
                                .select("Id")
                                .where({Email: guest.email})
                                .limit(1)
                                .run();
                            return result[0]?.Id;
                         })
                     );

                     if (guestIds.length > 0) {
                        salesForceMsg.GuestSpeaker__c = guestIds.filter(Boolean).join(';');
                     }
                  }

                  if (rabbitMQMsg.RegisteredUsers?.User) {
                     const userList = Array.isArray(rabbitMQMsg.RegisteredUsers.User)
                         ? rabbitMQMsg.RegisteredUsers.User
                         : [rabbitMQMsg.RegisteredUsers.User];

                     const userIds = await Promise.all(
                         userList.map(async u => {
                            if (!u?.email) return null;
                            const result = await salesforceClient.sObject("Session_Participant__c")
                                .select("Id")
                                .where({ParticipantEmail__c: u.email})
                                .limit(1)
                                .run();
                            return result[0]?.Id;
                         })
                     );

                     if (userIds.length > 0) {
                        salesForceMsg.RegisteredUsers__c = userIds.filter(Boolean).join(';');
                     }
                  }

                  await salesforceClient.sObject("Session__c").update(salesForceMsg);
                  console.log("✅ Sessie geüpdatet in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij update:", err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.sObject("Session__c").delete(SalesforceObjId);
                  console.log("✅ Sessie verwijderd uit Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij delete:", err.message);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               console.error(`❌ Ongeldige queue: ${action}`);
               return;
         }

         await channel.ack(msg);
      });

      console.log(`🔔 Luistert naar berichten op queue "crm_session_${action}"…`);
   }
};
