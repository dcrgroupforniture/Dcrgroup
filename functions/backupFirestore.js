import { exec } from "child_process";

export const backupFirestore = () => {
  return new Promise((resolve, reject) => {
    exec(
      "gcloud firestore export gs://dcr-group-firestore-backup",
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      }
    );
  });
};
