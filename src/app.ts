/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';

const fetch = require('node-fetch');

/**
 * The structure of an object in the database.
 */
type ObjectDescriptor = {
    resourceId: string;
    attachPoint: string;
    scale: {
        x: number;
        y: number;
        z: number;
    };
    rotation: {
        x: number;
        y: number;
        z: number;
    };
    position: {
        x: number;
        y: number;
        z: number;
    };
    previewMargin: number;
};

/**
 * WearAHat Application - Showcasing avatar attachments.
 */
export default class WearAHat {
    // Container for primitives
    private assets: MRE.AssetContainer;

    // Container for instantiated objects.
    private attachedObjects = new Map<MRE.Guid, MRE.Actor>();

    // Load the database of objects.
    // tslint:disable-next-line:no-var-requires variable-name
    private ObjectDatabase: { [key: string]: ObjectDescriptor } = {};

    // Options
    private previewMargin = 1.5; // spacing between preview objects

    /**
     * Constructs a new instance of this class.
     * @param context The MRE SDK context.
     * @param baseUrl The baseUrl to this project's `./public` folder.
     */
    constructor(private context: MRE.Context, private params: MRE.ParameterSet, private baseUrl: string) {
        this.assets = new MRE.AssetContainer(context);

        // Hook the context events we're interested in.
        this.context.onStarted(() => {

            if(this.params.content_pack){
                // Specify a url to a JSON file
                // https://account.altvr.com/content_packs/1187493048011980938
                // e.g. ws://10.0.1.89:3901?content_pack=1187493048011980938

                fetch('https://account.altvr.com/api/content_packs/' + this.params.content_pack + '/raw.json')
                    .then((res: any) => res.json())
                    .then((json: any) => {
                        // combine custom content pack plus default controls (modded to X only)
                        this.ObjectDatabase = Object.assign({}, json, require('../public/defaults.json'));;
                        this.started();
                    })
           } else { return; }

        });
        this.context.onUserLeft(user => this.userLeft(user));
    }

    /**
     * Called when an application session starts up.
     */
    private async started() {
        this.showWearables();
    }

    /**
     * Called when a user leaves the application (probably left the Altspace world where this app is running).
     * @param user The user that left the building.
     */
    private userLeft(user: MRE.User) {
        // If the user was wearing something, destroy it. 
        // Otherwise it would be orphaned in the world.
        if (this.attachedObjects.has(user.id)) { this.attachedObjects.get(user.id).destroy(); }
        this.attachedObjects.delete(user.id);
    }

    /**
     * Show a menu of wearable selections.
     */
    private showWearables() {
        // Create a parent object for all the menu items.
        const menu = MRE.Actor.CreateEmpty(this.context);
        let x = 0;

        // check for options first since order isn't guaranteed in a dict
        for (const k of Object.keys(this.ObjectDatabase)) {
            if (k == "options"){
                const options = this.ObjectDatabase[k]
                if (options.previewMargin){
                    this.previewMargin = options.previewMargin;
                }
            }
        }

        // Loop over the hat database, creating a menu item for each entry.
        for (const objectId of Object.keys(this.ObjectDatabase)) {
            if (objectId == "options") continue; // skip the special 'options' key

            const objectRecord = this.ObjectDatabase[objectId];

            // Create a clickable button.
            var button;

            // special scaling and rotation for commands
            let regex: RegExp = /!$/; // e.g. clear!
            const rotation = (regex.test(objectId) && objectRecord.rotation) ? objectRecord.rotation : { x: 0, y: 0, z: 0 }
            const scale = (regex.test(objectId) && objectRecord.scale) ? objectRecord.scale : { x: 3, y: 3, z: 3 }

            // Create a Artifact without a collider
            MRE.Actor.CreateFromLibrary(this.context, {
                resourceId: objectRecord.resourceId,
                actor: {
                    transform: {
                        local: {
                            position: { x, y: 1, z: 0 },
                            rotation: MRE.Quaternion.FromEulerAngles(
                                rotation.x * MRE.DegreesToRadians,
                                rotation.y * MRE.DegreesToRadians,
                                rotation.z * MRE.DegreesToRadians),
                            scale: scale
                        }
                    }
                }
            });

            // Create an invisible cube with a collider
            button = MRE.Actor.CreatePrimitive(this.assets, {
                definition: {
                    shape: MRE.PrimitiveShape.Box,
                    dimensions: { x: 0.4, y: 0.4, z: 0.4 } // make sure there's a gap
                },
                addCollider: true,
                actor: {
                    parentId: menu.id,
                    name: objectId,
                    transform: {
                        local: {
                            position: { x, y: 1, z: 0 },
                            scale: scale
                        }
                    },
                    appearance: {
                        enabled: false
                    }
                }
            });

            // Set a click handler on the button.
            button.setBehavior(MRE.ButtonBehavior).onClick(user => this.wearObject(objectId, user.id));

            x += this.previewMargin;
        }
    }

    /**
     * Instantiate a hat and attach it to the avatar's head.
     * @param objectId The id of the hat in the hat database.
     * @param userId The id of the user we will attach the hat to.
     */
    private wearObject(objectId: string, userId: MRE.Guid) {
        // If the user selected 'clear', then early out.
        if (objectId == "clear!") {
            // If the user is wearing a hat, destroy it.
            if (this.attachedObjects.has(userId)) this.attachedObjects.get(userId).destroy();
            this.attachedObjects.delete(userId);
            return;
        }
        else if (objectId == "moveup!") {
            if (this.attachedObjects.has(userId))
                this.attachedObjects.get(userId).transform.local.position.y += 0.01;
            return;
        }
        else if (objectId == "movedown!") {
            if (this.attachedObjects.has(userId))
                this.attachedObjects.get(userId).transform.local.position.y -= 0.01;
            return;
        }
        else if (objectId == "moveforward!") {
            if (this.attachedObjects.has(userId))
                this.attachedObjects.get(userId).transform.local.position.z += 0.01;
            return;
        }
        else if (objectId == "moveback!") {
            if (this.attachedObjects.has(userId))
                this.attachedObjects.get(userId).transform.local.position.z -= 0.01;
            return;
        }
        else if (objectId == "sizeup!") {
            if (this.attachedObjects.has(userId)){
                this.attachedObjects.get(userId).transform.local.scale.x += 0.02;
                this.attachedObjects.get(userId).transform.local.scale.y += 0.02;
                this.attachedObjects.get(userId).transform.local.scale.z += 0.02;
            }
            return;
        }
        else if (objectId == "sizedown!") {
            if (this.attachedObjects.has(userId)){
                this.attachedObjects.get(userId).transform.local.scale.x -= 0.02;
                this.attachedObjects.get(userId).transform.local.scale.y -= 0.02;
                this.attachedObjects.get(userId).transform.local.scale.z -= 0.02;
            }
            return;
        }

        // If the user is wearing a hat, destroy it.
        if (this.attachedObjects.has(userId)) this.attachedObjects.get(userId).destroy();
        this.attachedObjects.delete(userId);

        const objectRecord = this.ObjectDatabase[objectId];

        // Create the hat model and attach it to the avatar's head.
        // Jimmy

        const position = objectRecord.position ? objectRecord.position : { x: 0, y: 0, z: 0 }
        const scale = objectRecord.scale ? objectRecord.scale : { x: 1.5, y: 1.5, z: 1.5 }
        const rotation = objectRecord.rotation ? objectRecord.rotation : { x: 0, y: 180, z: 0 }
        const attachPoint = <MRE.AttachPoint> (objectRecord.attachPoint ? objectRecord.attachPoint : 'head')

        this.attachedObjects.set(userId, MRE.Actor.CreateFromLibrary(this.context, {
            resourceId: objectRecord.resourceId,
            actor: {
                transform: {
                    local: {
                        position: position,
                        rotation: MRE.Quaternion.FromEulerAngles(
                            rotation.x * MRE.DegreesToRadians,
                            rotation.y * MRE.DegreesToRadians,
                            rotation.z * MRE.DegreesToRadians),
                        scale: scale
                    }
                },
                attachment: {
                    attachPoint: attachPoint,
                    userId
                }
            }
        }));
    }
}
