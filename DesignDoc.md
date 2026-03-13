Tattle Tale

Medium: 
Pick-Up-And-Play Web Game or App, Hopefully Cross-Platform Compatible

Game Length:
10-20 Minute Games

Target Audience:
Age Group: Teenage to Adult, ~15 - 40 years old
Target Audience: Casual Gamer, Very Social, Newer Generation

Main Idea: 
A reimagination of classic good team vs. bad team social deduction games like Mafia/Werewolf/Imposter, but with an emphasis on the groups of people you are allowed to communicate with.
Players are divided into two teams:
Friends (Good Team)
Hackers (Bad Team)
Unlike traditional social deduction games, players are not limited to a single shared discussion space. Instead, they interact through Contact Channels:
A public group chat
One-on-one private messages
Role-specific group chats


Special roles can create, restrict, monitor, or manipulate these communication channels, leading to misinformation, paranoia, and strategic social engineering.

DETAILED RULES
Overview
Tattle Tale is played in alternating Day Cycles and Night Cycles until a win condition is met.
Each cycle is time-limited and divided into structured sub-phases to keep gameplay fast, readable, and accessible to new players.
The central mechanic of the game is communication access: who can talk to whom, when, and under what restrictions.
Cycle Structure Summary
Day Cycle: Open discussion, task completion, persuasion, and voting
Night Cycle: Hidden actions, coordination, and sabotage
These cycles repeat until either team achieves its win condition.
Opening
Roles are assigned randomly
Pertinent information to each player is revealed:
Friends: Shown a keyword shared among all friends
Hackers: Shown fellow hackers
Day Cycle
Purpose:
Public discussion, private coordination, task completion, deception, and collective decision-making.
Default Duration:
3 Minutes Total (Adjustable in Settings)
Day Cycle Phases
Phase 1: Open Communication
All players may communicate using any Contact Channels they currently have access to.
This includes:
Main Group Chat
Private Messages
Temporary Group Chats
Friends work on tasks on their “desktop” that will be required to vote that day cycle
Any communication restrictions applied during the previous Night Cycle are active during this phase.
Players may:
Discuss suspicions
Share or fabricate information
Attempt to influence votes
Coordinate privately (if permitted)
Time: 1 minute 30 seconds
Phase 2: Final Statements (Optional, Host-Toggleable)
Private Messages are disabled.
Only the Main Group Chat remains active.
Encourages public accountability and last-minute persuasion.
Time: 30 seconds
Phase 3: Voting
All players may cast one vote.
Players may vote to:
Eliminate a specific player
Vote for no elimination
Votes are secret.
Voting cannot be changed once submitted. 


Voting Resolution Rules:
If no elimination has the most votes, nobody is eliminated
Otherwise, the player with the most votes is eliminated.
In the event of a tie, no player is eliminated.
Abstaining counts as a valid vote.
Time: 30 seconds
Phase 4: Resolution
If a player is eliminated:
They are removed from all Contact Channels.
Their role is revealed or hidden depending on lobby settings.
A short pause allows players to process the result.
Time: 10 seconds
The game then transitions into the Night Cycle.
Night Cycle
Purpose:
Secret coordination, information gathering, and interference.
Default Duration:
40 Seconds Total (Adjustable in Settings)
Night Cycle Phases
Phase 1: Hacker Discussion
Hackers may communicate freely in the Hacker Group Chat.
No public or private communication outside of allowed channels.
Used to coordinate strategy and discuss potential targets.


Time: 30 seconds
Phase 2: Role Actions
All players with Night abilities select their actions simultaneously.
Actions are submitted privately.
No player receives feedback during this phase.


Examples of Night Actions:
Choosing a player to hack
Investigating a player’s role
Protecting a player
Jamming or monitoring communications
Creating temporary group chats


Time: 10 seconds
Phase 3: Action Resolution
Night actions are resolved automatically in a fixed priority order to prevent conflicts:
Protection effects
Information-gathering effects
Communication interference effects
Eliminations
Chat creation or modification


All outcomes are finalized during this phase.
Time: Automatically handled by Code
Phase 4: Reveal
Any players eliminated during the Night Cycle are revealed to the group.
New communication permissions and restrictions take effect.
The next Day Cycle begins immediately after.


Time: ~10 seconds
Communication Rules
All messages normally display the sender’s identity.
Certain roles may:
Restrict communication
Monitor messages
Create new group chats
Eliminated players lose access to all Contact Channels and cannot communicate.
Separate hacked group chat
(If psychic role is implemented) The first hacked friend can send the encrypted message
Time Limits
Timers are enforced to:
Prevent analysis paralysis
Encourage instinctive social behavior
Keep sessions short and replayable
Match modern messaging-platform pacing
Recommended Defaults:
Day Cycle: 3 minutes
Night Cycle: 1 minute
Hosts may adjust these values in lobby settings.
Win Conditions
Hackers Win If:
Hackers make up at least half of the remaining players.
Friends Win If:
All Hackers are eliminated from the game.

Roles & Abilities
Role Overview
Players are randomly assigned one role at the start of the game.
Each role belongs to either the Friend Team or the Hacker Team and inherits that team’s baseline mechanics unless otherwise stated. Also perhaps a Neutral Party with roles with their own win conditions.
Friend Team Roles
Friend (MVP)
Ability: None
Standard role with no special powers. Has full access to default chats and one vote per Day Cycle.
Extrovert (MVP)
Ability: Temporary Group Chat
Each Night Cycle, creates a temporary group chat and invites any number of players. The chat lasts through the following Day Cycle and is deleted afterward.
White Hat Hacker (MVP)
Ability: Investigate
Each Night Cycle, selects one player and learns their role privately.
Security Specialist (MVP)
Ability: Protect
Each Night Cycle, selects one player to protect. That player cannot be eliminated by hacking during that Night Cycle.
Psychic
Ability: Commune
Each Night Cycle, receives a “highly limited” (will have to figure out what that means) message from hacked friends.
Vengeful
Ability: Spite
Upon being either hacked or kicked from the group chat, can choose one other player to take down with them.

Firewall 

Ability: Channel lock

Once per game, locks one chat channel (group or DM) for the remainder of the day cycle. Everyone can see it is locked. 

DM Leaks
Ability: the snitch
Random confidential chats are occasionally leaked to users who aren’t supposed to have access to them to spice up the game flow. The leaked message sender will still remain a secret. 

Neutral Party

The Jealous
Ability: Identity Theft is not a joke Jim, millions of families suffer from it every year
You can choose any player to switch roles with once a game. Whoever you switch with becomes the “default” version of their team.

Hacker Team Roles
Hacker (MVP)
Ability: None (Baseline Hacker)
Standard Hacker with access to the Hacker Group Chat and participation in Night Cycle coordination.
The Boss
Ability: Final Elimination Choice
Each Night Cycle, selects the final hacking target, overriding disagreements among Hackers.
Signal Jammer
Ability: Jam Private Messages
Each Night Cycle, selects one player. That player cannot send or receive Private Messages during the next Day Cycle.
Eavesdropper
Ability: Monitor Private Messages
Each Night Cycle, selects one player. Can read all Private Messages sent or received by that player during the next Day Cycle without their knowledge.
Troller
Ability: Misdirection
Each Night Cycle, selects one player. During the next Day Cycle, that player’s first Private Message will be altered by the moderator in a misleading way (scrambled wording or swapped names). The original sender is not notified of the change.
Imitator
Ability: Mimick
Each Night Cycle, selects one player. During the next Day Cycle, that player cannot chat. The hacker can chat using their name but cannot Private Message during that round.
Design Notes
All abilities are optional and can be toggled per lobby.
Roles are designed to manipulate communication access
The role system is modular and expandable.

Point System
When hackers win, they get 10 points * the number of hackers remaining 
When friends win, they get 60 points (maybe more depending on # of players)
Users are able to change their avatar using these points
Leaderboard for global pts as well

Vibe/Aesthetic

Retro Style Messaging Platforms, with the Group Chats in a scroll bar on the side, a huge open space for messages in the middle. We can also include custom emojis, gifs, maybe even allow players to import their own.



Preset and Custom PFPs
Make Emojis:


Basically, hope is to allow for players’ natural group chemistry interaction that comes from their group chats.
