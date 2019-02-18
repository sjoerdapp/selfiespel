import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
admin.initializeApp(functions.config().firebase);

const {Storage} = require('@google-cloud/storage');
// Creates a client
const gcs = new Storage({
	projectId: process.env.GCP_PROJECT
});

const db = admin.firestore();

import { tmpdir } from 'os';
import { join, dirname } from 'path';

import * as sharp from 'sharp';
import * as fs from 'fs-extra';

//creates a resized image when an images is uploaded
export const generateThumbs = functions.storage
	.object()
	.onFinalize(async object => {
  	
  	const bucket = gcs.bucket(object.bucket);
	const filePath = object.name || ''; // File path in the bucket.
	const contentType = object.contentType || '';
	const metaData = object.metadata;
 	const fileName = filePath.split('/').pop() || '';
 	const bucketDir = dirname(filePath);

	const workingDir = join(tmpdir(), 'thumbs');
	const tmpFilePath = join(workingDir, fileName);

	if (fileName.includes('thumb@') || !contentType.includes('image')){
		console.log('exiting function');
		return false;
	}

	//ensure thumbnair dir exists
	await fs.ensureDir(workingDir);

	//download source file
	await bucket.file(filePath).download({
		destination: tmpFilePath
	});

	//resize images and define array of upload promises
	const sizes = [128, 512];

	const filePaths : string[] = [];
	const uploadPromises = sizes.map(async size => {
		const thumbName = `thumb@${size}_${fileName}`;
		const thumbPath = join(workingDir, thumbName);
		filePaths.push(join(bucketDir, thumbName));

		//resize source image
		await sharp(tmpFilePath)
			.rotate()
			.resize(size,size)
			.toFile(thumbPath);

		//upload to GCS
		return bucket.upload(thumbPath, {
			destination: join(bucketDir, thumbName)
		});
	});

	//run the upload operations
	await Promise.all(uploadPromises);

	//cleanup remove the tmp/thumbs from the filesystem
	await fs.remove(workingDir);

	const imageRef = db.collection('images').doc()
	return imageRef.set({
		pathOriginal: filePath,
		path: filePaths[1],
		pathTN: filePaths[0],
		assignmentId: metaData ? metaData.assignmentId : null,
		gameId: metaData ? metaData.gameId : null,
		teamId: metaData ? metaData.teamId: null,
		userId: metaData ? metaData.userId : null,
		teamName: metaData ? metaData.teamName : null,
		assignment: metaData ? metaData.assignment : null
	}).then( _ => {
		const timestamp = new Date().toISOString();
		const messageRef = db.collection('messages').doc()
		return messageRef.set({
			content: metaData ? metaData.teamName + ' heeft een nieuwe foto geupload voor selfie met ' 
										+ metaData.assignment + '!' : 'Nieuwe foto geupload!',
			style: 'info',
			gameId: metaData ? metaData.gameId : null,
			timestamp: timestamp,
			dismissed: false
		})
	});
	
});