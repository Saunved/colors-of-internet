import { useState } from "preact/hooks";
import { ChevronDown } from "./icons/chevron-down";
import { ChevronUp } from "./icons/chevron-up";

export default function Info({ usersOnline, simulationIsOn }) {

    const [infoOpen, setInfoOpen] = useState(false);

    function handleInfoClick() {
        if (!infoOpen) {
            setInfoOpen(true);
        }
        else {
            setInfoOpen(false);
        }
    }

    return (

        <>

            <button
                className="mt-2 flex items-center justify-center hover:bg-gray-600 cursor-pointer border p-0.5 rounded-xl"
                onClick={handleInfoClick}
            >
                <span className="ml-2">Info</span>
                {
                    !infoOpen ? <ChevronDown /> : <ChevronUp />

                }
            </button>

            {
                infoOpen &&
                <div className="absolute top-20 left-0 w-full min-h-screen overflow-y-auto px-4 py-8 text-white"
                    style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}>

                    <section className="mb-4 text-sm">
                        <p>Users online: {usersOnline}</p>
                        <p>Simulation status: {simulationIsOn ? "ON" : "OFF"}</p>
                    </section>

                    <section className="text-xl mb-8">
                        <p className="mb-4">
                            tldr;<br />
                            This is a mini-project I (<a className="text-blue-500 underline" href="https://saunved.com" target="_blank">Saunved</a>) built to deepen my understanding of real-time data synchronization through concurrency handling, optimistic UI updates, and versioning. Continue reading for more information.
                        </p>

                        <p className="mb-4">
                            Each cell you see turning on or off is a real person, somewhere in the world turning it on or off. Users currently online: {usersOnline}. You can choose to watch and enjoy, or you can tap around and have fun making patterns. If there are fewer people online, maybe you can make a trippy pattern emerge! On mobile you will see fewer cells. The larger your screen, the bigger the grid gets.
                        </p>

                        <p className="mb-4">
                            I have used Supabase's broadcast and presence for handling the synchronization of cell updates across clients.
                        </p>

                        <p className="mb-4">
                            This system works on a Last Write Wins methodology. So if many people tap a cell at roughly the same time, the update that the server receives last is the one that is respected. This isn't necessarily the best approach, but for this mini-project, it's good enough.
                        </p>

                        <p className="mb-4">
                            Each cell also carries a version number that is used for resolving sync issues across multiple clients. This is to ensure that all clients eventually reach the same state, and if a client is out of sync, the version number allows for this to be resolved easily.
                        </p>
                        <p className="mb-4">
                            You will notice that tapping a cell usually gives you instant feedback. This is because of optimistic UI updates (i.e. the UI updates before the database actually syncs this information). This is typically done to provide a smooth UX.
                            <br />
                            At the same time, spam clicking is not really possible since the cell is put into a "cooldown" state when it is tapped (indicated by a red border).
                        </p>

                        <p className="mb-4">
                            "Simulating" implies that some clicks are being simulated. This usually happens in cases when there aren't enough users for creating a fun effect.
                        </p>

                        <p className="mb-4">
                            I haven't added any particular checks for bots (e.g. with captchas or Cloudflare turnstile) since this project is just for fun.
                        </p>
                    </section>
                </div>
            }
        </>
    )
}